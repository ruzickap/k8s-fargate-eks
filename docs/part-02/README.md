# K8s tools

Install the basic tools, before running some applications like DNS integration
([external-dns](https://github.com/kubernetes-sigs/external-dns)), Ingress ([ingress-nginx](https://kubernetes.github.io/ingress-nginx/)),
certificate management ([cert-manager](https://cert-manager.io/)), ...

## aws-load-balancer-controller

Get the VPC ID where is the cluster:

```bash
EKS_VPC_ID=$(aws eks describe-cluster --name "${CLUSTER_NAME}" --query "cluster.resourcesVpcConfig.vpcId" --output text)
```

Install `aws-load-balancer-controller`
[helm chart](https://artifacthub.io/packages/helm/aws/aws-load-balancer-controller)
and modify the
[default values](https://github.com/aws/eks-charts/blob/master/stable/aws-load-balancer-controller/values.yaml).

```bash
helm repo add eks https://aws.github.io/eks-charts
helm install --version 1.1.1 --namespace kube-system --values - aws-load-balancer-controller eks/aws-load-balancer-controller << EOF
clusterName: ${CLUSTER_NAME}
serviceAccount:
  create: false
  name: aws-load-balancer-controller
region: ${AWS_DEFAULT_REGION}
vpcId: ${EKS_VPC_ID}
defaultTags:
  $(echo "$TAGS" | sed "s/ /\n  /g;s/=/: /g")
EOF
```

Output:

```text
"eks" has been added to your repositories
NAME: aws-load-balancer-controller
LAST DEPLOYED: Sat Jan  2 11:15:29 2021
NAMESPACE: kube-system
STATUS: deployed
REVISION: 1
TEST SUITE: None
NOTES:
AWS Load Balancer controller installed!
```

## cert-manager

::: warning
This is not working due to Fargate specifics [https://github.com/jetstack/cert-manager/issues/3237](https://github.com/jetstack/cert-manager/issues/3237)
:::

Install `cert-manager`
[helm chart](https://artifacthub.io/packages/helm/jetstack/cert-manager)
and modify the
[default values](https://github.com/jetstack/cert-manager/blob/master/deploy/charts/cert-manager/values.yaml).
The the previously created Role ARN will be used to annotate service account.

```shell
ROUTE53_ROLE_ARN_CERT_MANAGER=$(eksctl get iamserviceaccount --cluster=${CLUSTER_NAME} --namespace cert-manager -o json  | jq -r ".iam.serviceAccounts[] | select(.metadata.name==\"cert-manager\") .status.roleARN")

helm repo add jetstack https://charts.jetstack.io
helm install --version v1.1.0 --namespace cert-manager --create-namespace --wait --values - cert-manager jetstack/cert-manager << EOF
installCRDs: true
image:
  pullPolicy: Always
serviceAccount:
  annotations:
    eks.amazonaws.com/role-arn: ${ROUTE53_ROLE_ARN_CERT_MANAGER}
extraArgs:
  - --enable-certificate-owner-ref=true
securityContext:
  enabled: true
EOF
```

Add ClusterIssuers for Let's Encrypt staging and production:

```shell
kubectl apply -f - << EOF
apiVersion: cert-manager.io/v1
kind: ClusterIssuer
metadata:
  name: letsencrypt-staging-dns
  namespace: cert-manager
spec:
  acme:
    server: https://acme-staging-v02.api.letsencrypt.org/directory
    email: ${MY_EMAIL}
    privateKeySecretRef:
      name: letsencrypt-staging-dns
    solvers:
      - selector:
          dnsZones:
            - ${CLUSTER_FQDN}
        dns01:
          route53:
            region: ${AWS_DEFAULT_REGION}
---
# Create ClusterIssuer for production to get real signed certificates
apiVersion: cert-manager.io/v1
kind: ClusterIssuer
metadata:
  name: letsencrypt-production-dns
  namespace: cert-manager
spec:
  acme:
    server: https://acme-v02.api.letsencrypt.org/directory
    email: ${MY_EMAIL}
    privateKeySecretRef:
      name: letsencrypt-production-dns
    solvers:
      - selector:
          dnsZones:
            - ${CLUSTER_FQDN}
        dns01:
          route53:
            region: ${AWS_DEFAULT_REGION}
EOF
```

Output:

```text
Error from server (InternalError): error when creating "STDIN": Internal error occurred: failed calling webhook "webhook.cert-manager.io": Post https://cert-manager-webhook.cert-manager.svc:443/mutate?timeout=10s: x509: certificate is valid for ip-192-168-92-45.eu-central-1.compute.internal, not cert-manager-webhook.cert-manager.svc
Error from server (InternalError): error when creating "STDIN": Internal error occurred: failed calling webhook "webhook.cert-manager.io": Post https://cert-manager-webhook.cert-manager.svc:443/mutate?timeout=10s: x509: certificate is valid for ip-192-168-92-45.eu-central-1.compute.internal, not cert-manager-webhook.cert-manager.svc
```

Create wildcard certificate using `cert-manager`:

```shell
kubectl apply -f - << EOF
apiVersion: cert-manager.io/v1
kind: Certificate
metadata:
  name: ingress-cert-${LETSENCRYPT_ENVIRONMENT}
  namespace: cert-manager
spec:
  secretName: ingress-cert-${LETSENCRYPT_ENVIRONMENT}
  issuerRef:
    name: letsencrypt-${LETSENCRYPT_ENVIRONMENT}-dns
    kind: ClusterIssuer
  commonName: "*.${CLUSTER_FQDN}"
  dnsNames:
    - "*.${CLUSTER_FQDN}"
    - "${CLUSTER_FQDN}"
EOF
```

## external-dns

::: warning
This is not working - not sure why...
:::

Install `external-dns`
[helm chart](https://artifacthub.io/packages/helm/bitnami/external-dns)
and modify the
[default values](https://github.com/bitnami/charts/blob/master/bitnami/external-dns/values.yaml).
`external-dns` will take care about DNS records.
(`ROUTE53_ROLE_ARN` variable was defined before for `cert-manager`)

```shell
ROUTE53_ROLE_ARN_EXTERNAL_DNS=$(eksctl get iamserviceaccount --cluster=${CLUSTER_NAME} --namespace kube-system -o json  | jq -r ".iam.serviceAccounts[] | select(.metadata.name==\"external-dns\") .status.roleARN")
```

```shell
helm repo add bitnami https://charts.bitnami.com/bitnami
helm install --version 4.4.1 --namespace external-dns --create-namespace --values - external-dns bitnami/external-dns << EOF
aws:
  region: ${AWS_DEFAULT_REGION}
domainFilters:
  - ${CLUSTER_FQDN}
interval: 10s
policy: sync
replicas: 1
serviceAccount:
  annotations:
    eks.amazonaws.com/role-arn: ${ROUTE53_ROLE_ARN_EXTERNAL_DNS}
securityContext:
  allowPrivilegeEscalation: false
  readOnlyRootFilesystem: true
  capabilities:
    drop: ["ALL"]
  runAsNonRoot: true
EOF
```

## kubed

::: warning
This is not working due to Fargate specifics [https://github.com/jetstack/cert-manager/issues/3237](https://github.com/jetstack/cert-manager/issues/3237)
:::

`kubed` - tool which helps with copying the certificate secretes across the
namespaces.

See the details:

* [https://cert-manager.io/docs/faq/kubed/](https://cert-manager.io/docs/faq/kubed/)
* [https://appscode.com/products/kubed/v0.12.0/guides/config-syncer/intra-cluster/](https://appscode.com/products/kubed/v0.12.0/guides/config-syncer/intra-cluster/)

Install `kubed`
[helm chart](https://artifacthub.io/packages/helm/appscode/kubed)
and modify the
[default values](https://github.com/appscode/kubed/blob/master/charts/kubed/values.yaml).

```shell
helm repo add appscode https://charts.appscode.com/stable/
helm install --version v0.12.0 --namespace kubed --create-namespace --values - kubed appscode/kubed << EOF
imagePullPolicy: Always
config:
  clusterName: ${CLUSTER_FQDN}
EOF
```

Annotate the wildcard certificate secret. It will allow `kubed` to distribute
it to all namespaces.

```shell
kubectl wait --timeout=5m --namespace cert-manager --for=condition=Ready certificate "ingress-cert-${LETSENCRYPT_ENVIRONMENT}"
kubectl annotate secret "ingress-cert-${LETSENCRYPT_ENVIRONMENT}" -n cert-manager kubed.appscode.com/sync=""
```
