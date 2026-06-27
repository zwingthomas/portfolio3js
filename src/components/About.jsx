import React from 'react'
import { Tilt } from 'react-tilt'
import { motion } from 'framer-motion';
import { styles } from '../styles';
import { services } from '../constants';
import {fadeIn, textVariant } from '../utils/motion';

// higher order components
import { SectionWrapper } from '../hoc';

const ServiceCard = ({ index, title, icon }) => {
  return (
    <Tilt className="xs:w-[250px] w-full">
      <motion.div
        variants={fadeIn("right", "spring", 0.5 * index, 0.75)}
        className="w-full green-pink-gradient p-[1px] rounded-[20px] shadow-card"
      >
        <div options={{
          max: 45,
          scale: 1,
          speed: 10
        }}
        className="bg-tertiary rounded-[20px] py-5 px-12 min-h-[280px] flex justify-evenly items-center flex-col">
          <img src={icon} alt={title} className="w-16 h-16 object-contain"/>
          <h3 className="text-white text-[20px] font-bold text-center">{title}</h3>
        </div>

      </motion.div>
    </Tilt>
  )
}

const About = () => {
  return (
    <>
      <motion.div variants={textVariant()}>
        <p className={styles.sectionSubText}>Introduction</p>
        <h2 className={styles.sectionHeadText}>About me</h2>
      </motion.div>

      <motion.p
        variants={fadeIn("", "", 0.1, 1)}
        className="mt-4 text-secondary text-[17px] max-w-3xl leading-[30px]"
      >
        I am a Backend Software Engineer at Zubie, where I build AI-driven, cloud-native vehicle
        telematics in Python on Google App Engine and Cloud Run for fleet accounts of up to ~60k vehicles.
        As the engineering org's AI subject-matter expert, I lead a weekly session mentoring engineers on
        Claude and own our AI-integration initiative, while driving API performance work, large-scale
        refactors, and the team's CI and Terraform infrastructure-as-code efforts. I'm a Google Cloud
        Professional Cloud Architect with deep roots in Site Reliability Engineering, and I love mentoring
        peers and accomplishing great things through the power of teamwork. Let me know if you'd like to
        build something together!
      </motion.p>

      <div className="mt-20 flex flex-wrap gap-10">
        {services.map((service, index) => (
          <ServiceCard key={service.title} index={index} {...service}/>
        ))}
      </div>


    </>
  )
}

export default SectionWrapper(About, "about");