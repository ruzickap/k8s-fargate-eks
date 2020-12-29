# Amazon EKS Fargate

![Amazon EKS](https://raw.githubusercontent.com/cncf/landscape/7f5b02ecba914a32912e77fc78e1c54d1c2f98ec/hosted_logos/amazon-eks.svg?sanitize=true
"Amazon EKS")

Before starting with the main content, it's necessary to provision
the [Amazon Fargate with EKS](https://aws.amazon.com/eks/) in AWS.

## Requirements

If you would like to follow this documents and it's task you will need to set up
few environment variables.

The `LETSENCRYPT_ENVIRONMENT` variable should be one of:

* `staging` - Let’s Encrypt will create testing certificate (not valid)
* `production` - Let’s Encrypt will create valid certificate (use with care)

`BASE_DOMAIN` contains DNS records for all your Kubernetes clusters. The cluster
names will look like `CLUSTER_NAME`.`BASE_DOMAIN` (`k1.k8s.mylabs.dev`).

```bash
# Hostname / FQDN definitions
export BASE_DOMAIN="k8s.mylabs.dev"
export CLUSTER_NAME="k2"
export CLUSTER_FQDN="${CLUSTER_NAME}.${BASE_DOMAIN}"
export KUBECONFIG=${PWD}/kubeconfig-${CLUSTER_NAME}.conf
# * "production" - valid certificates signed by Lets Encrypt ""
# * "staging" - not trusted certs signed by Lets Encrypt "Fake LE Intermediate X1"
export LETSENCRYPT_ENVIRONMENT=${LETSENCRYPT_ENVIRONMENT:-staging}
export MY_EMAIL="petr.ruzicka@gmail.com"
# AWS Region
export AWS_DEFAULT_REGION="eu-central-1"
# Tags used to tag the AWS resources
export TAGS="Owner=${MY_EMAIL} Environment=Dev Tribe=Cloud_Native Squad=Cloud_Container_Platform"
echo -e "${MY_EMAIL} | ${LETSENCRYPT_ENVIRONMENT} | ${CLUSTER_NAME} | ${BASE_DOMAIN} | ${CLUSTER_FQDN}\n${TAGS}"
```

Prepare GitHub OAuth "access" credentials ans AWS "access" variables.

You will need to configure AWS CLI: [https://docs.aws.amazon.com/cli/latest/userguide/cli-chap-configure.html](https://docs.aws.amazon.com/cli/latest/userguide/cli-chap-configure.html)

```shell
# AWS Credentials
export AWS_ACCESS_KEY_ID="AxxxxxxxxxxxxxxxxxxY"
export AWS_SECRET_ACCESS_KEY="txxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxh"
```

## Prepare the local working environment

::: tip
You can skip these steps if you have all the required software already
installed.
:::

Install necessary software:

```bash
if [[ -x /usr/bin/apt-get ]]; then
  apt update -qq
  DEBIAN_FRONTEND=noninteractive apt-get install -y -qq ansible awscli git jq sudo
fi
```

Install [kubectl](https://github.com/kubernetes/kubectl) binary:

```bash
if [[ ! -x /usr/local/bin/kubectl ]]; then
  # https://github.com/kubernetes/kubectl/releases
  sudo curl -s -Lo /usr/local/bin/kubectl "https://storage.googleapis.com/kubernetes-release/release/v1.19.5/bin/$(uname | sed "s/./\L&/g" )/amd64/kubectl"
  sudo chmod a+x /usr/local/bin/kubectl
fi
```

Install [Helm](https://helm.sh/):

```bash
if [[ ! -x /usr/local/bin/helm ]]; then
  # https://github.com/helm/helm/releases
  curl -s https://raw.githubusercontent.com/helm/helm/master/scripts/get | bash -s -- --version v3.4.0
fi
```

Install [eksctl](https://eksctl.io/):

```bash
if [[ ! -x /usr/local/bin/eksctl ]]; then
  # https://github.com/weaveworks/eksctl/releases
  curl -s -L "https://github.com/weaveworks/eksctl/releases/download/0.34.0/eksctl_$(uname)_amd64.tar.gz" | sudo tar xz -C /usr/local/bin/
fi
```

Install [AWS IAM Authenticator for Kubernetes](https://github.com/kubernetes-sigs/aws-iam-authenticator):

```bash
if [[ ! -x /usr/local/bin/aws-iam-authenticator ]]; then
  # https://docs.aws.amazon.com/eks/latest/userguide/install-aws-iam-authenticator.html
  sudo curl -s -Lo /usr/local/bin/aws-iam-authenticator "https://amazon-eks.s3.us-west-2.amazonaws.com/1.18.9/2020-11-02/bin/$(uname | sed "s/./\L&/g" )/amd64/aws-iam-authenticator"
  sudo chmod a+x /usr/local/bin/aws-iam-authenticator
fi
```

## Configure AWS Route 53 Domain delegation

Create DNS zone (`BASE_DOMAIN`):

```shell
aws route53 create-hosted-zone --output json \
  --name ${BASE_DOMAIN} \
  --caller-reference "$(date)" \
  --hosted-zone-config="{\"Comment\": \"Created by ${MY_EMAIL}\", \"PrivateZone\": false}" | jq
```

Use your domain registrar to change the nameservers for your zone (for example
"mylabs.dev") to use the Amazon Route 53 nameservers. Here is the way how you
can find out the the Route 53 nameservers:

```shell
NEW_ZONE_ID=$(aws route53 list-hosted-zones --query "HostedZones[?Name==\`${BASE_DOMAIN}.\`].Id" --output text)
NEW_ZONE_NS=$(aws route53 get-hosted-zone --output json --id "${NEW_ZONE_ID}" --query "DelegationSet.NameServers")
NEW_ZONE_NS1=$(echo "${NEW_ZONE_NS}" | jq -r ".[0]")
NEW_ZONE_NS2=$(echo "${NEW_ZONE_NS}" | jq -r ".[1]")
```

Create the NS record in `k8s.mylabs.dev` (`BASE_DOMAIN`) for proper zone
delegation. This step depends on your domain registrar - I'm using CloudFlare
and using Ansible to automate it:

```shell
ansible -m cloudflare_dns -c local -i "localhost," localhost -a "zone=mylabs.dev record=${BASE_DOMAIN} type=NS value=${NEW_ZONE_NS1} solo=true proxied=no account_email=${CLOUDFLARE_EMAIL} account_api_token=${CLOUDFLARE_API_KEY}"
ansible -m cloudflare_dns -c local -i "localhost," localhost -a "zone=mylabs.dev record=${BASE_DOMAIN} type=NS value=${NEW_ZONE_NS2} solo=false proxied=no account_email=${CLOUDFLARE_EMAIL} account_api_token=${CLOUDFLARE_API_KEY}"
```

Output:

```text
localhost | CHANGED => {
    "ansible_facts": {
        "discovered_interpreter_python": "/usr/bin/python"
    },
    "changed": true,
    "result": {
        "record": {
            "content": "ns-885.awsdns-46.net",
            "created_on": "2020-11-13T06:25:32.18642Z",
            "id": "dxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxb",
            "locked": false,
            "meta": {
                "auto_added": false,
                "managed_by_apps": false,
                "managed_by_argo_tunnel": false,
                "source": "primary"
            },
            "modified_on": "2020-11-13T06:25:32.18642Z",
            "name": "k8s.mylabs.dev",
            "proxiable": false,
            "proxied": false,
            "ttl": 1,
            "type": "NS",
            "zone_id": "2xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxe",
            "zone_name": "mylabs.dev"
        }
    }
}
localhost | CHANGED => {
    "ansible_facts": {
        "discovered_interpreter_python": "/usr/bin/python"
    },
    "changed": true,
    "result": {
        "record": {
            "content": "ns-1692.awsdns-19.co.uk",
            "created_on": "2020-11-13T06:25:37.605605Z",
            "id": "9xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxb",
            "locked": false,
            "meta": {
                "auto_added": false,
                "managed_by_apps": false,
                "managed_by_argo_tunnel": false,
                "source": "primary"
            },
            "modified_on": "2020-11-13T06:25:37.605605Z",
            "name": "k8s.mylabs.dev",
            "proxiable": false,
            "proxied": false,
            "ttl": 1,
            "type": "NS",
            "zone_id": "2xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxe",
            "zone_name": "mylabs.dev"
        }
    }
}
```

## Add new domain to Route 53, Policies, S3

Details with examples are described on these links:

* [https://aws.amazon.com/blogs/opensource/introducing-fine-grained-iam-roles-service-accounts/](https://aws.amazon.com/blogs/opensource/introducing-fine-grained-iam-roles-service-accounts/)
* [https://cert-manager.io/docs/configuration/acme/dns01/route53/](https://cert-manager.io/docs/configuration/acme/dns01/route53/)
* [https://github.com/kubernetes-sigs/external-dns/blob/master/docs/tutorials/aws.md](https://github.com/kubernetes-sigs/external-dns/blob/master/docs/tutorials/aws.md)

Create CloudFormation template containing policies for Route53, S3 access
(Harbor) and Domain. AWS IAM Policy `${ClusterFQDN}-AmazonRoute53Domains`
allows `cert-manager` and `external-dns` to modify the Route 53 entries.
Put new domain `CLUSTER_FQDN` to the Route 53 and configure the
DNS delegation from the `BASE_DOMAIN`.

```bash
test -d tmp || mkdir -v tmp

cat > tmp/aws_policies.yml << \EOF
Description: "Template to generate the necessary Route53 Policies for access to Route53 and create EFS"
Parameters:
  ClusterFQDN:
    Description: "Cluster domain where all necessary app subdomains will live (subdomain of BaseDomain). Ex: k1.k8s.mylabs.dev"
    Type: String
  BaseDomain:
    Description: "Base domain where cluster domains + their subdomains will live. Ex: k8s.mylabs.dev"
    Type: String
Resources:
  Route53Policy:
    Type: AWS::IAM::ManagedPolicy
    Properties:
      ManagedPolicyName: !Sub "${ClusterFQDN}-AmazonRoute53Domains"
      Description: !Sub "Policy required by cert-manager or external-dns to be able to modify Route 53 entries for ${ClusterFQDN}"
      PolicyDocument:
        Version: "2012-10-17"
        Statement:
        - Effect: Allow
          Action:
          - route53:GetChange
          Resource: "arn:aws:route53:::change/*"
        - Effect: Allow
          Action:
          - route53:ChangeResourceRecordSets
          - route53:ListResourceRecordSets
          Resource: !Sub "arn:aws:route53:::hostedzone/${HostedZone.Id}"
        - Effect: Allow
          Action:
          - route53:ListHostedZones
          - route53:ListHostedZonesByName
          Resource: "*"
  HostedZone:
    Type: AWS::Route53::HostedZone
    Properties:
      Name: !Ref ClusterFQDN
  RecordSet:
    Type: AWS::Route53::RecordSet
    Properties:
      HostedZoneName: !Sub "${BaseDomain}."
      Name: !Ref ClusterFQDN
      Type: NS
      TTL: 60
      ResourceRecords: !GetAtt HostedZone.NameServers
  CloudWatchPolicy:
    Type: AWS::IAM::ManagedPolicy
    Properties:
      ManagedPolicyName: !Sub "${ClusterFQDN}-CloudWatch"
      Description: !Sub "Policy required by Fargate to log to CloudWatch for ${ClusterFQDN}"
      PolicyDocument:
        Version: "2012-10-17"
        Statement:
        - Effect: Allow
          Action:
          - logs:CreateLogStream
          - logs:CreateLogGroup
          - logs:DescribeLogStreams
          - logs:PutLogEvents
          Resource: "*"
Outputs:
  Route53Policy:
    Description: The ARN of the created AmazonRoute53Domains policy
    Value:
      Ref: Route53Policy
    Export:
      Name:
        Fn::Sub: "${AWS::StackName}-Route53Policy"
  HostedZone:
    Description: The ARN of the created Route53 Zone for K8s cluster
    Value:
      Ref: HostedZone
    Export:
      Name:
        Fn::Sub: "${AWS::StackName}-HostedZone"
  CloudWatchPolicy:
    Description: The ARN of the created CloudWatchPolicy policy
    Value:
      Ref: CloudWatchPolicy
    Export:
      Name:
        Fn::Sub: "${AWS::StackName}-CloudWatchPolicy"
EOF

eval aws cloudformation deploy --capabilities CAPABILITY_NAMED_IAM \
  --parameter-overrides "ClusterFQDN=${CLUSTER_FQDN} BaseDomain=${BASE_DOMAIN}" \
  --stack-name "${CLUSTER_NAME}-route53-cloudwatch" --template-file tmp/aws_policies.yml --tags "${TAGS}"

AWS_CLOUDFORMATION_DETAILS=$(aws cloudformation describe-stacks --stack-name "${CLUSTER_NAME}-route53-cloudwatch")
ROUTE53_POLICY_ARN=$(echo "${AWS_CLOUDFORMATION_DETAILS}" | jq -r ".Stacks[0].Outputs[] | select(.OutputKey==\"Route53Policy\") .OutputValue")
CLOUDWATCH_POLICY_ARN=$(echo "${AWS_CLOUDFORMATION_DETAILS}" | jq -r ".Stacks[0].Outputs[] | select(.OutputKey==\"CloudWatchPolicy\") .OutputValue")
```

## Create Amazon EKS

![EKS](https://raw.githubusercontent.com/aws-samples/eks-workshop/65b766c494a5b4f5420b2912d8373c4957163541/static/images/3-service-animated.gif
"EKS")

Create [Amazon EKS](https://aws.amazon.com/eks/) in AWS by using [eksctl](https://eksctl.io/).
It's a tool from [Weaveworks](https://weave.works/) based on official
AWS CloudFormation templates which will be used to launch and configure our
Fargate + EKS cluster.

![eksctl](https://raw.githubusercontent.com/weaveworks/eksctl/c365149fc1a0b8d357139cbd6cda5aee8841c16c/logo/eksctl.png
"eksctl")

Create the Amazon EKS cluster using `eksctl`:

```bash
eksctl create cluster --config-file - --kubeconfig "${KUBECONFIG}" << EOF
# https://eksctl.io/usage/schema/
apiVersion: eksctl.io/v1alpha5
kind: ClusterConfig

metadata:
  name: ${CLUSTER_NAME}
  region: ${AWS_DEFAULT_REGION}
  version: "1.18"
  tags: &tags
    Owner: ${MY_EMAIL}
    Environment: Dev
    Tribe: Cloud_Native
    Squad: Cloud_Container_Platform

availabilityZones:
  - ${AWS_DEFAULT_REGION}a
  - ${AWS_DEFAULT_REGION}b

iam:
  withOIDC: true
  serviceAccounts:
    - metadata:
        name: cert-manager
        namespace: cert-manager
      attachPolicyARNs:
        - ${ROUTE53_POLICY_ARN}
    - metadata:
        name: external-dns
        namespace: external-dns
      attachPolicyARNs:
        - ${ROUTE53_POLICY_ARN}

fargateProfiles:
  - name: fargate-default
    selectors:
      - namespace: kube-system
      - namespace: default
    tags: *tags

cloudWatch:
  clusterLogging:
     enableTypes: ["audit", "authenticator", "controllerManager"]
EOF
```

Output:

```text
[ℹ]  eksctl version 0.35.0
[ℹ]  using region eu-central-1
[ℹ]  subnets for eu-central-1a - public:192.168.0.0/19 private:192.168.64.0/19
[ℹ]  subnets for eu-central-1b - public:192.168.32.0/19 private:192.168.96.0/19
[ℹ]  using Kubernetes version 1.18
[ℹ]  creating EKS cluster "k2" in "eu-central-1" region with Fargate profile
[ℹ]  will create a CloudFormation stack for cluster itself and 0 nodegroup stack(s)
[ℹ]  will create a CloudFormation stack for cluster itself and 0 managed nodegroup stack(s)
[ℹ]  if you encounter any issues, check CloudFormation console or try 'eksctl utils describe-stacks --region=eu-central-1 --cluster=k2'
[ℹ]  Kubernetes API endpoint access will use default of {publicAccess=true, privateAccess=false} for cluster "k2" in "eu-central-1"
[ℹ]  2 sequential tasks: { create cluster control plane "k2", 2 sequential sub-tasks: { 6 sequential sub-tasks: { tag cluster, update CloudWatch logging configuration, create fargate profiles, associate IAM OIDC provider, 3 parallel sub-tasks: { 2 sequential sub-tasks: { create IAM role for serviceaccount "cert-manager/cert-manager", create serviceaccount "cert-manager/cert-manager" }, 2 sequential sub-tasks: { create IAM role for serviceaccount "external-dns/external-dns", create serviceaccount "external-dns/external-dns" }, 2 sequential sub-tasks: { create IAM role for serviceaccount "kube-system/aws-node", create serviceaccount "kube-system/aws-node" } }, restart daemonset "kube-system/aws-node" }, create addons } }
[ℹ]  building cluster stack "eksctl-k2-cluster"
[ℹ]  deploying stack "eksctl-k2-cluster"
[✔]  tagged EKS cluster (Squad=Cloud_Container_Platform, Tribe=Cloud_Native, Environment=Dev, Owner=petr.ruzicka@gmail.com)
[✔]  configured CloudWatch logging for cluster "k2" in "eu-central-1" (enabled types: audit, authenticator, controllerManager & disabled types: api, scheduler)
[ℹ]  creating Fargate profile "fargate-default" on EKS cluster "k2"
[ℹ]  created Fargate profile "fargate-default" on EKS cluster "k2"
[ℹ]  "coredns" is now schedulable onto Fargate
[ℹ]  "coredns" is now scheduled onto Fargate
[ℹ]  "coredns" pods are now scheduled onto Fargate
[ℹ]  building iamserviceaccount stack "eksctl-k2-addon-iamserviceaccount-external-dns-external-dns"
[ℹ]  building iamserviceaccount stack "eksctl-k2-addon-iamserviceaccount-cert-manager-cert-manager"
[ℹ]  building iamserviceaccount stack "eksctl-k2-addon-iamserviceaccount-kube-system-aws-node"
[ℹ]  deploying stack "eksctl-k2-addon-iamserviceaccount-external-dns-external-dns"
[ℹ]  deploying stack "eksctl-k2-addon-iamserviceaccount-cert-manager-cert-manager"
[ℹ]  deploying stack "eksctl-k2-addon-iamserviceaccount-kube-system-aws-node"
[ℹ]  serviceaccount "kube-system/aws-node" already exists
[ℹ]  created namespace "cert-manager"
[ℹ]  created namespace "external-dns"
[ℹ]  updated serviceaccount "kube-system/aws-node"
[ℹ]  created serviceaccount "cert-manager/cert-manager"
[ℹ]  created serviceaccount "external-dns/external-dns"
[ℹ]  daemonset "kube-system/aws-node" restarted
[ℹ]  waiting for the control plane availability...
[✔]  saved kubeconfig as "/Users/ruzickap/git/k8s-fargate-eks/kubeconfig-k2.conf"
[ℹ]  no tasks
[✔]  all EKS cluster resources for "k2" have been created
[ℹ]  kubectl command should work with "/Users/ruzickap/git/k8s-fargate-eks/kubeconfig-k2.conf", try 'kubectl --kubeconfig=/Users/ruzickap/git/k8s-fargate-eks/kubeconfig-k2.conf get nodes'
[✔]  EKS cluster "k2" in "eu-central-1" region is ready
```

Remove namespaces with serviceaccounts created by `eksctl`:

```bash
kubectl delete serviceaccount -n cert-manager cert-manager
kubectl delete serviceaccount -n external-dns external-dns
```

Check the nodes:

```bash
kubectl get nodes -o wide
```

Output:

```text
NAME                                                       STATUS   ROLES    AGE   VERSION              INTERNAL-IP       EXTERNAL-IP   OS-IMAGE         KERNEL-VERSION                  CONTAINER-RUNTIME
fargate-ip-192-168-112-249.eu-central-1.compute.internal   Ready    <none>   67s   v1.18.8-eks-7c9bda   192.168.112.249   <none>        Amazon Linux 2   4.14.209-160.335.amzn2.x86_64   containerd://1.3.2
fargate-ip-192-168-74-240.eu-central-1.compute.internal    Ready    <none>   69s   v1.18.8-eks-7c9bda   192.168.74.240    <none>        Amazon Linux 2   4.14.209-160.335.amzn2.x86_64   containerd://1.3.2
```

Check the pods:

```bash
kubectl get pods --all-namespaces
```

Output:

```text
NAMESPACE     NAME                       READY   STATUS    RESTARTS   AGE
kube-system   coredns-7c5b55f765-dlb4k   1/1     Running   0          10m
kube-system   coredns-7c5b55f765-t8x7v   1/1     Running   0          10m
```

Attach the policy to the [pod execution role](https://docs.aws.amazon.com/eks/latest/userguide/pod-execution-role.html)
of your EKS on Fargate cluster:

```bash
CLUSTER_ARN=$(eksctl get iamidentitymapping --cluster=${CLUSTER_NAME} -o json | jq -r ".[].rolearn")
aws iam attach-role-policy --policy-arn "${CLOUDWATCH_POLICY_ARN}" --role-name "${CLUSTER_ARN#*/}"
```

Create the dedicated `aws-observability` namespace and the ConfigMap for Fluent Bit:

```bash
kubectl apply -f - << EOF
kind: Namespace
apiVersion: v1
metadata:
  name: aws-observability
  labels:
    aws-observability: enabled
---
kind: ConfigMap
apiVersion: v1
metadata:
  name: aws-logging
  namespace: aws-observability
data:
  output.conf: |
    [OUTPUT]
        Name cloudwatch_logs
        Match   *
        region ${AWS_DEFAULT_REGION}
        log_group_name /aws/eks/${CLUSTER_FQDN}/logs
        log_stream_prefix fluentbit-
        auto_create_group On
EOF
```
