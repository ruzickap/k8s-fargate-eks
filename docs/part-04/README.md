# Clean-up

![Clean-up](https://raw.githubusercontent.com/aws-samples/eks-workshop/65b766c494a5b4f5420b2912d8373c4957163541/static/images/cleanup.svg?sanitize=true
"Clean-up")

Set necessary variables:

```bash
export BASE_DOMAIN="k8s.mylabs.dev"
export CLUSTER_NAME="k2"
export CLUSTER_FQDN="${CLUSTER_NAME}.${BASE_DOMAIN}"
export AWS_DEFAULT_REGION="eu-central-1"
export KUBECONFIG=${PWD}/kubeconfig-${CLUSTER_NAME}.conf
```

Detach policy from IAM role:

```bash
AWS_CLOUDFORMATION_DETAILS=$(aws cloudformation describe-stacks --stack-name "${CLUSTER_NAME}-route53-cloudwatch")
CLOUDWATCH_POLICY_ARN=$(echo "${AWS_CLOUDFORMATION_DETAILS}" | jq -r ".Stacks[0].Outputs[] | select(.OutputKey==\"CloudWatchPolicy\") .OutputValue")
CLUSTER_ARN=$(eksctl get iamidentitymapping --region=${AWS_DEFAULT_REGION} --cluster=${CLUSTER_NAME} -o json | jq -r ".[].rolearn")
aws iam detach-role-policy --policy-arn "${CLOUDWATCH_POLICY_ARN}" --role-name "${CLUSTER_ARN#*/}"
```

Remove EKS cluster:

```bash
if eksctl get cluster --name=${CLUSTER_NAME} 2>/dev/null ; then
  eksctl delete cluster --name=${CLUSTER_NAME}
fi
```

Output:

```text
```

Remove Route 53 DNS records from DNS Zone:

```bash
CLUSTER_FQDN_ZONE_ID=$(aws route53 list-hosted-zones --query "HostedZones[?Name==\`${CLUSTER_FQDN}.\`].Id" --output text)
if [[ -n "${CLUSTER_FQDN_ZONE_ID}" ]]; then
  aws route53 list-resource-record-sets --hosted-zone-id "${CLUSTER_FQDN_ZONE_ID}" | jq -c '.ResourceRecordSets[] | select (.Type != "SOA" and .Type != "NS")' |
  while read -r RESOURCERECORDSET; do
    aws route53 change-resource-record-sets \
      --hosted-zone-id "${CLUSTER_FQDN_ZONE_ID}" \
      --change-batch '{"Changes":[{"Action":"DELETE","ResourceRecordSet": '"${RESOURCERECORDSET}"' }]}' \
      --output text --query 'ChangeInfo.Id'
  done
fi
```

Remove CloudFormation stacks [Route53, CloudWatch]

```bash
aws cloudformation delete-stack --stack-name "${CLUSTER_NAME}-route53-cloudwatch"
```

Remove CloudWatch log groups:

```bash
for LOG_GROUP in $(aws logs describe-log-groups | jq -r ".logGroups[] | select(.logGroupName|test(\"/${CLUSTER_NAME}/|/${CLUSTER_FQDN}/\")) .logGroupName"); do
  echo "*** Delete log group: ${LOG_GROUP}"
  aws logs delete-log-group --log-group-name "${LOG_GROUP}"
done
```

Remove Helm data:

```bash
if [[ -d ~/Library/Caches/helm ]]; then rm -rf ~/Library/Caches/helm; fi
if [[ -d ~/Library/Preferences/helm ]]; then rm -rf ~/Library/Preferences/helm; fi
if [[ -d ~/.helm ]]; then rm -rf ~/.helm; fi
```

Remove `tmp` directory:

```bash
rm -rf tmp &> /dev/null
```

Remove other files:

```bash
rm demo-magic.sh "${KUBECONFIG}*" README.sh &> /dev/null || true
```

Wait for CloudFormation to be deleted:

```bash
aws cloudformation wait stack-delete-complete --stack-name "${CLUSTER_NAME}-route53-cloudwatch"
```

Cleanup completed:

```bash
echo "Clenup completed..."
```
