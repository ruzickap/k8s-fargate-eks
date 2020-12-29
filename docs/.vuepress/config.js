module.exports = {
  title: 'AWS Fargate with Amazon EKS',
  description: 'AWS Fargate with Amazon EKS',
  base: '/k8s-fargate-eks/',
  head: [
    ['link', { rel: 'icon', href: 'https://kubernetes.io/images/favicon.png' }]
  ],
  themeConfig: {
    displayAllHeaders: true,
    lastUpdated: true,
    repo: 'ruzickap/k8s-fargate-eks',
    docsDir: 'docs',
    editLinks: true,
    logo: 'https://kubernetes.io/images/favicon.png',
    nav: [
      { text: 'Home', link: '/' },
      {
        text: 'Links',
        items: [
          { text: 'Amazon EKS', link: 'https://aws.amazon.com/eks/' },
          { text: 'Amazon Fargate', link: 'https://aws.amazon.com/fargate/' }
        ]
      }
    ],
    sidebar: [
      '/',
      '/part-01/',
      '/part-02/',
      '/part-03/',
      '/part-04/'
    ]
  },
  plugins: [
    '@vuepress/medium-zoom',
    '@vuepress/back-to-top',
    'reading-progress',
    'seo',
    'smooth-scroll'
  ]
}
