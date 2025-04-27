import {
    mobile,
    backend,
    creator,
    web,
    javascript,
    typescript,
    html,
    css,
    reactjs,
    redux,
    tailwind,
    nodejs,
    mongodb,
    git,
    figma,
    docker,
    utc,
    thomsonreuters,
    chrobinson,
    kohls,
    carrent,
    jobit,
    tripguide,
    travelers,
    threejs,
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
      name: "HTML 5",
      icon: html,
    },
    {
      name: "CSS 3",
      icon: css,
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
      name: "Redux Toolkit",
      icon: redux,
    },
    {
      name: "Tailwind CSS",
      icon: tailwind,
    },
    {
      name: "Node JS",
      icon: nodejs,
    },
    {
      name: "MongoDB",
      icon: mongodb,
    },
    {
      name: "Three JS",
      icon: threejs,
    },
    {
      name: "git",
      icon: git,
    },
    {
      name: "figma",
      icon: figma,
    },
    {
      name: "docker",
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
  ];
  
  const projects = [
    {
      name: "Car Rent",
      description:
        "Web-based platform that allows users to search, book, and manage car rentals from various providers, providing a convenient and efficient solution for transportation needs.",
      tags: [
        {
          name: "react",
          color: "blue-text-gradient",
        },
        {
          name: "mongodb",
          color: "green-text-gradient",
        },
        {
          name: "tailwind",
          color: "pink-text-gradient",
        },
      ],
      image: carrent,
      source_code_link: "https://github.com/",
    },
    {
      name: "Job IT",
      description:
        "Web application that enables users to search for job openings, view estimated salary ranges for positions, and locate available jobs based on their current location.",
      tags: [
        {
          name: "react",
          color: "blue-text-gradient",
        },
        {
          name: "restapi",
          color: "green-text-gradient",
        },
        {
          name: "scss",
          color: "pink-text-gradient",
        },
      ],
      image: jobit,
      source_code_link: "https://github.com/",
    },
    {
      name: "Trip Guide",
      description:
        "A comprehensive travel booking platform that allows users to book flights, hotels, and rental cars, and offers curated recommendations for popular destinations.",
      tags: [
        {
          name: "nextjs",
          color: "blue-text-gradient",
        },
        {
          name: "supabase",
          color: "green-text-gradient",
        },
        {
          name: "css",
          color: "pink-text-gradient",
        },
      ],
      image: tripguide,
      source_code_link: "https://github.com/",
    },
  ];
  
  export { services, technologies, experiences, testimonials, projects };