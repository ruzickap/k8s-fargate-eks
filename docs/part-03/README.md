# Workload

Run some workload on the K8s...

## podinfo

Install `podinfo`
[helm chart](https://github.com/stefanprodan/podinfo/releases)
and modify the
[default values](https://github.com/stefanprodan/podinfo/blob/master/charts/podinfo/values.yaml).

```bash
helm repo add sp https://stefanprodan.github.io/podinfo
helm install --version 5.1.1 --values - podinfo sp/podinfo << EOF
ingress:
  enabled: true
  path: /
  hosts:
    - podinfo.${CLUSTER_FQDN}
  # tls:
  #   - secretName: ingress-cert-${LETSENCRYPT_ENVIRONMENT}
  #     hosts:
  #       - podinfo.${CLUSTER_FQDN}
EOF
```

Output:

```text
"sp" has been added to your repositories
NAME: podinfo
LAST DEPLOYED: Sat Jan  2 11:15:35 2021
NAMESPACE: default
STATUS: deployed
REVISION: 1
NOTES:
1. Get the application URL by running these commands:
  http://podinfo.k2.k8s.mylabs.dev/
```

## kuard

Install [kuard](https://github.com/kubernetes-up-and-running/kuard):

```bash
kubectl run kuard --image=gcr.io/kuar-demo/kuard-amd64:blue --port=8080 --expose=true --labels="app=kuard"

kubectl apply -f - << EOF
apiVersion: extensions/v1beta1
kind: Ingress
metadata:
  name: kuard
  labels:
    app: kuard
spec:
  rules:
    - host: kuard.${CLUSTER_FQDN}
      http:
        paths:
          - backend:
              serviceName: kuard
              servicePort: 8080
            path: /
  # tls:
  #   - hosts:
  #       - kuard.${CLUSTER_FQDN}
  #     secretName: ingress-cert-${LETSENCRYPT_ENVIRONMENT}
EOF
```

## Octant

```bash
helm repo add octant-dashboard https://aleveille.github.io/octant-dashboard-turnkey/repo
helm install --version 0.16.2 --values - octant octant-dashboard/octant << EOF
plugins:
  install:
    - https://github.com/bloodorangeio/octant-helm/releases/download/v0.1.0/octant-helm_0.1.0_linux_amd64.tar.gz
ingress:
  enabled: true
  hosts:
    - host: octant.${CLUSTER_FQDN}
      paths: ["/"]
  # tls:
  #   - secretName: ingress-cert-${LETSENCRYPT_ENVIRONMENT}
  #     hosts:
  #       - octant.${CLUSTER_FQDN}
EOF
```

Output:

```text
"octant-dashboard" has been added to your repositories
NAME: octant
LAST DEPLOYED: Sat Jan  2 11:15:41 2021
NAMESPACE: default
STATUS: deployed
REVISION: 1
NOTES:
1. Get the application URL by running these commands:
  http://octant.k2.k8s.mylabs.dev/
```

Set retention for all log groups which belongs to the cluster to 1 day:

```bash
for LOG_GROUP in $(aws logs describe-log-groups | jq -r ".logGroups[] | select(.logGroupName|test(\"/${CLUSTER_NAME}/|/${CLUSTER_FQDN}/\")) .logGroupName"); do
  aws logs put-retention-policy --log-group-name "${LOG_GROUP}" --retention-in-days 1
done
```
