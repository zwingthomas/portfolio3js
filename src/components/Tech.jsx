import { BallCanvas } from './canvas';
import { SectionWrapper } from '../hoc';
import { technologies } from '../constants';

const Tech = () => {
  return (
    <div className="flex flex-row flex-wrap justify-center gap-10">
      {technologies.map((technology) => (
        <div className="w-2 h-28" key={technology.name}>
          <BallCanvas icon={technologies.icon}/>
        </div>
      ))}
    </div>
  )
}

export default SectionWrapper(Tech, "")