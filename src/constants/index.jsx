import {
    mobile,
    backend,
    creator,
    web,
    javascript,
    typescript,
    html,
    ansible,
    reactjs,
    aws,
    bash,
    gcp,
    kubernetes,
    git,
    python,
    docker,
    utc,
    thomsonreuters,
    chrobinson,
    kohls,
    jenkins,
    cloudagnostic,
    indigogardencinemaclub,
    travelers,
    terraform,
  } from "../assets";
  
  export const navLinks = [
    {
      id: "about",
      title: "About",
    },
    {
      id: "work",
      title: "Work",
    },
    {
      id: "contact",
      title: "Contact",
    },
  ];
  
  const services = [
    {
      title: "Fullstack",
      icon: web,
    },
    {
      title: "Cloud Architect",
      icon: mobile,
    },
    {
      title: "DSA Master",
      icon: backend,
    },
    {
      title: "Site Reliability Engineer",
      icon: creator,
    },
  ];
  
  const technologies = [
    {
      name: "GCP",
      icon: gcp,
    },
    {
      name: "AWS",
      icon: aws,
    },
    {
      name: "Python",
      icon: python,
    },
    {
      name: "JavaScript",
      icon: javascript,
    },
    {
      name: "TypeScript",
      icon: typescript,
    },
    {
      name: "React JS",
      icon: reactjs,
    },
    {
      name: "HTML",
      icon: html,
    },
    {
      name: "Bash",
      icon: bash,
    },
    {
      name: "Git",
      icon: git,
    },
    {
      name: "Ansible",
      icon: ansible,
    },
    {
      name: "Terraform",
      icon: terraform,
    },
    {
      name: "Kubernetes",
      icon: kubernetes,
    },
    {
      name: "Docker",
      icon: docker,
    },
  ];
  
  const experiences = [
    {
      title: "Embedded Software Engineer",
      company_name: "UTC Aerospace",
      icon: utc,
      iconBg: "#123192",
      date: "Jun 2017 - Jan 2019",
      points: [
        "Developed tools on two applications systems to allow communication between aircrafts, pilots, and landing towers.",
        <>
          Worked on the front end of the{" "}
          <a
            href="https://www.collinsaerospace.com/what-we-do/industries/commercial-aviation/connected-cockpit/intelisight/hardware"
            target="_blank"
            rel="noopener noreferrer"
            className="text-blue-500 underline"
          >
            Tablet Interface Module and AID
          </a>
          . Programmed in .NET, JavaScript, Razor, and C#: implementing
          RESTful frameworks.
        </>,
        "Wrote scripts for many different testing requirements, most notably to assess a variety of CFast cards in order to select the best memory device.",
        "Aided the embedded team by scripting for data collection and analysis in python, programming low-level systems in C, and relying on tools we built in Java.",
      ],
    },
    {
      title: "Web App Developer",
      company_name: "Travelers",
      icon: travelers,
      iconBg: "#FFFFFF",
      date: "Jan 2019 - Jun 2019",
      points: [
        "Worked on an agile team to develop and manage an internal website for insurance claims handling.",
        "As a full-stack developer I got experience working in Angular JS and React as well as a .NET backend.",
        "Implementing responsive design and ensuring cross-browser compatibility."
      ],
    },
    {
      title: "Cloud Engineer",
      company_name: "Thomson Reuters",
      icon: thomsonreuters,
      iconBg: "#C64C21",
      date: "Nov 2019 - Feb 2021",
      points: [
        "Amazon Web Services",
        "Worked primarily with Aurora, SQL, ec2 server maintenance, Amazon Machine Images, and CICD pipelines.",
        "Primarily programmed in PowerShell, Java, and Python.",
      ],
    },
    {
      title: "Site Reliability Engineer",
      company_name: "C.H. Robinson",
      icon: chrobinson,
      iconBg: "#FFFFFF",
      date: "Feb 2021 - Mar 2022",
      points: [
        "Microsoft Azure",
        "Set up cloud ready nginx URLs and app gateways with Terraform to secure apis with SSL certs, automating some steps with Python scripts.",
        "Implementing GSLBs utilizing F5 to route between app gateways for HADR.",
        "Utilize Terraform to provision services as IaC in Azure and Vault.",
        "Manage over a dozen Kubernetes clusters with around 100 apps (mainly microservice apis).",
        "Reliability-as-a-service with preventative alerting using Prometheus, Grafana, and Elk Stack.",
        "Setting up Helm charts for provisioning networking backends on clusters.",
        "Run and debug Jenkins pipelines for repository creation, standing up and deploying apps",
        "Day to day I used Python, Linux, Kubernetes, Terraform, Logging and Metrics, Helm, Jenkins"
      ],
    },
    {
      title: "Site Reliability Engineer",
      company_name: "Kohl's",
      icon: kohls,
      iconBg: "#E8F0E0",
      date: "Mar 2022 - Jan 2025",
      points: [
        "Google Cloud Platform",
        "Collaborating with cross-functional teams including designers, product managers, and other developers to create high-quality automations and tooling.",
        "Mentoring my peers (many senior to me) through Python courses often involving Selenium.",
        "Averaged around one automation per month, wearing many hats at once.",
        "Led a FinOps push to rightsize resources.",
        "Ideated the winning project and led the team to victory in our company's ChatGPT API hackathon.",
        "Led push for centralized Airflow, implementing security measures and reducing toil.",
        "Automated Dynatrace log bucketing in ALL dashboards with Dynatrace API: massive toil and cost savings.",
        "Resolved critical Black Friday incident as an OpenShift SME during peak shipping loads Saturday night when I was not on-call. Without my intervention we would've had to VTO warehouse workers for all online sales during our most impactful shipping day of the year."
      ],
    },
  ];
  
  const testimonials = [
    {
      testimonial:
        "I hired Thomas to bring curiosity and software engineering to a team that was mostly operations driven. And he did just that. He has an enthusiasm for learning new tech stacks, and may not know it, but he's slowly becoming a full stack developer simply by just wanting to learn about everything.",
      name: "Dave Wallraff",
      designation: "Product Leader for Platform",
      company: "Kohl's",
      image: "https://media.licdn.com/dms/image/v2/C5103AQFlYVMxQvox6Q/profile-displayphoto-shrink_800_800/profile-displayphoto-shrink_800_800/0/1547708985062?e=1751500800&v=beta&t=OBOe6YTWMYupdvpfPrI9dQmlyG0FuZzvP-3jdwBqNUk",
    },
    {
      testimonial:
        "During my internship at Kohl’s, Thomas was an assertive voice of reason for my team. In addition, he found an opportunity to reduce Redis' costs across the company. He was generous enough to include me in the project. He was a great mentor in preparing me for meetings with senior management. Due to his proactiveness, he was able to save the company upwards of $36,000 a month. In my short time knowing him, I found him resourceful, collaborative, and consistently supportive. I have no doubt he\’ll make a great addition to any team.",
      name: "Charles Havyarimana",
      designation: "Intern",
      company: "Kohl's",
      image: "https://media.licdn.com/dms/image/v2/D4D03AQHGWzfii_dVzg/profile-displayphoto-shrink_800_800/profile-displayphoto-shrink_800_800/0/1698946095638?e=1751500800&v=beta&t=kylFJAZzN-7CBHVEhIJR0AcwBTJT1BQ_Ao9jQhBM3lw",
    },
    {
      testimonial:
        "Thomas was an absolute pleasure to work with—smart, creative, and always ready to tackle any challenge. He brought great ideas to the table and had a knack for adapting to whatever came his way. His talent and positive energy made a real difference, and he’ll definitely be missed. Wishing him all the best in their next adventure!",
      name: "Matthew Switzer",
      designation: "Supply Chain Executive",
      company: "Kohl's",
      image: "https://media.licdn.com/dms/image/v2/D5603AQHyTDMPxREZqA/profile-displayphoto-shrink_800_800/profile-displayphoto-shrink_800_800/0/1684525547220?e=1751500800&v=beta&t=EVjhV4bP-AKkiHNVwBR-QjWL2DT5inDipH3neGBHpQ8",
    },
    {
      testimonial:
        "Thomas has a great engineering/development mind. He is incredibly focused on delivering a solution that meets his customer's needs and works hard to keep them involved every step of the way with requirements gathering, building, testing, and support. Thomas also is never afraid to share his knowledge and experience to help lift up those around him. He loves new technology, consuming information about it to improve his competency and is always offering innovative ways to tackle the problems the team is facing.",
      name: "Robin Pindel",
      designation: "Supply Chain SRE",
      company: "Kohl's",
      image: "https://media.licdn.com/dms/image/v2/C4E03AQENHkjc1Ikxag/profile-displayphoto-shrink_800_800/profile-displayphoto-shrink_800_800/0/1635127977560?e=1751500800&v=beta&t=23vdaNCrG1DSe8xfztqLwmRNa0S9dsg596KqRUGT5FE",
    },
    {
      testimonial:
        "I had the pleasure of working with Thomas Zwinger for two years at Kohl’s, and he is an outstanding professional. His ability to combine Software Engineering and Reliability Engineering has greatly improved system reliability and streamlined processes. Thomas developed tools and automations that reduced manual work and minimized errors, making a real impact on our operations.\n\nA natural problem-solver, Thomas consistently identifies areas for improvement and implements strategic, high-quality solutions. He is also a fantastic team player, always ready to offer support and foster a positive, collaborative work environment.\n\nThomas is dependable, meets deadlines under pressure, and continuously seeks ways to improve. He would be a tremendous asset to any team or organization, and I highly recommend him.",
      name: "Debashish Swar",
      designation: "Supply Chain Architect",
      company: "Manhattan",
      image: "https://media.licdn.com/dms/image/v2/C4E03AQFLB3yk_MkuWA/profile-displayphoto-shrink_800_800/profile-displayphoto-shrink_800_800/0/1516764125025?e=1751500800&v=beta&t=6nrVdQ2EwJ_uOleIanNBfr_yvlNoDmSbLmrT4DaI2A0",
    },
    {
      testimonial:
        "I had the pleasure of being on a site reliability team with Thomas over the last few years, and was impressed with his dedication to developing his technological skillset. He played a major role in educating several members of our team on development best-practices. Additionally, he created a full stack application that was valuable for navigating issues with one of our third party vendors, Proship (PSLG). His dedication and hard work were evident, and he would make a fantastic addition to any team.",
      name: "Ben Jones",
      designation: "Senior Supply Chain SRE",
      company: "Kohl's",
      image: "https://media.licdn.com/dms/image/v2/C4E03AQF6jPnwDeXLbQ/profile-displayphoto-shrink_800_800/profile-displayphoto-shrink_800_800/0/1530856335500?e=1751500800&v=beta&t=5sUorVOtJGkKGJPEJpwcaMCq33ENniCOGi9iqQbArzs",
    },
    {
      testimonial:
        "To whom it may concern:\nMy name is Andrew Janosik, a Site Reliability Engineer at Kohls. I have 6 years of experience working in Software Development and Automation. While I've worked with many people over the course of my career, Thomas is one individual I have worked with who uniquely stands out.\nDuring our time together, Thomas displayed great talents in programming, the ability to work on a team, and willingness to find ways to make code and infrastructures efficient. When we first met, I was immediately impressed with Thomas and his ability to quickly learn and adapt to new technologies to meet the goals set before us as Site Reliability Engineers. We often switched coding languages based on the areas we had to cover that day. \nThomas and I were on the same team for about a year. During that time Thomas and I would pair on new automations using python and javascript to help monitor websites via Selenium. I always appreciated help from Thomas when he would teach me new tricks with javascript to ensure we were using the most efficient code possible. I also found it quite admirable that Thomas would often try to find areas where the company could save money. He would take lead to ensure managers would be able to save money on their budget by cleaning up resources. One example that comes to mind is when he found our redis instances were allocating more resources than needed and Kohls could save money by lowering the overall resources for each area. \nIt's not just Thomas' technical skills that impressed me, he was a joy to work with because of his positivity and go-getter attitude. His ability to pivot during priority changes and quick learning were also necessary and valued in the constantly evolving SRE field. \nI am confident that Thomas would be a great fit for your organization. Not only will he bring the kind of skills and experiences you're looking for in an applicant, but he will also quickly become an asset and help your organization grow in any way he can.",
      name: "Andrew Janosik",
      designation: "Workday SRE",
      company: "Kohl's",
      image: "https://media.licdn.com/dms/image/v2/C4E03AQENHkjc1Ikxag/profile-displayphoto-shrink_800_800/profile-displayphoto-shrink_800_800/0/1635127977560?e=1751500800&v=beta&t=23vdaNCrG1DSe8xfztqLwmRNa0S9dsg596KqRUGT5FE",
    },
    {
      testimonial:
        "I worked closely with Thomas at Kohl's as a software engineer while he served as one of the Site Reliability Engineers for my team. Thomas brought exceptional technical expertise to our monitoring and cloud systems, while maintaining a collaborative approach to incident management. His ability to diagnose complex issues and implement effective solutions was invaluable to our team, and he frequently went above and beyond to ensure our systems' reliability. Pairing with us to find root causes of bugs. While it never surprised me (as we were always competing for the number 1 slot in Advent of Code) Thomas would often quickly find improvements to make to our code-base despite being an SRE. He would even mentor more junior developers: something I have never seen an SRE do before. Thomas's enthusiasm for sharing knowledge and learning new technologies made him an outstanding team member who elevated everyone around him, and his technical expertise would make him an excellent asset to any engineering organization.",
      name: "Joe Weller",
      designation: "Senior SWE",
      company: "Kohl's",
      image: "https://writedirection.com/wp-content/uploads/2016/09/blank-profile-picture-973460_960_720.png",
    },
    
  ];
  
  const projects = [
    {
      name: "Jenkins-in-a-Box",
      description:
        "With a single command on the command line and a few environment variables you can stand up a fully configured Jenkins server on an EC2 instance instantly.",
      tags: [
        {
          name: "jenkins",
          color: "jenkins-text-gradient",
        },
        {
          name: "ansible",
          color: "ansible-text-gradient",
        },
        {
          name: "terraform",
          color: "terraform-text-gradient",
        },
        {
          name: "shell",
          color: "shell-text-gradient",
        },
        {
          name: "jinja",
          color: "jinja-text-gradient",
        },
      ],
      image: jenkins,
      source_code_link: "https://github.com/zwingthomas/Jenkins",
    },
    {
      name: "Cloud Agnostic Website",
      description:
        "A Jenkins CICD pipeline that stands up a containerized website in GCP, AWS, and Azure. The website can be rebalanced between them.",
      tags: [
        {
          name: "terraform",
          color: "terraform-text-gradient",
        },
        {
          name: "jenkins cicd",
          color: "jenkins-text-gradient",
        },
        {
          name: "gcp",
          color: "gcp-text-gradient",
        },
        {
          name: "aws",
          color: "aws-text-gradient",
        },
        {
          name: "azure",
          color: "azure-text-gradient",
        },
        {
          name: "dns",
          color: "dns-text-gradient",
        },
      ],
      image: cloudagnostic,
      source_code_link: "https://github.com/zwingthomas/cloud-agnostic",
    },
    {
      name: "Indigo Garden Cinema Club",
      description:
        "A streaming platform to give a bigger cut to up and coming indie filmmakers.",
      tags: [
        {
          name: "nextjs",
          color: "nextjs-text-gradient",
        },
        {
          name: "tailwind css",
          color: "tailwind-text-gradient",
        },
        {
          name: "github actions",
          color: "github-actions-text-gradient",
        },
        {
          name: "terraform",
          color: "terraform-text-gradient",
        },
      ],
      image: indigogardencinemaclub,
      source_code_link: "https://github.com/The-Community-A-Coding-Cohort/Indigo-Garden-Club",
    },
  ];
  
  export { services, technologies, experiences, testimonials, projects };