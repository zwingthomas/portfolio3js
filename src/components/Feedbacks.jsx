import { useRef, useState, useEffect } from "react";
import { motion } from "framer-motion";
import { styles } from "../styles";
import { SectionWrapper } from "../hoc";
import { textVariant, fadeIn } from "../utils/motion";
import { testimonials } from "../constants";
import { ChevronLeft, ChevronRight } from "lucide-react";

const FeedbackCard = ({
  index,
  testimonial = "", // safe default
  name,
  designation,
  company,
  image
}) => {
  const [open, setOpen] = useState(false);
  const isLong = testimonial.length > 220;     // adjust threshold if desired

  return (
    <motion.div
      variants={fadeIn("", "spring", index * 0.5, 0.75)}
      className="bg-black-200 p-10 rounded-3xl xs:w-[320px] w-full"
    >
      <p className="text-white font-black text-[48px]">"</p>
      <p
        className={
          open
            ? "text-white tracking-wider text-[18px]"
            : "text-white tracking-wider text-[18px] line-clamp-4"
        }
      >
        {testimonial}
      </p>

      {isLong && (
        <button
          onClick={() => setOpen(!open)}
          className="mt-2 text-sm font-semibold text-blue-400 hover:underline"
        >
          {open ? "Show less ▲" : "Read more ▼"}
        </button>
      )}

      <div className="mt-7 flex justify-between items-center gap-1">
        <div className="flex-1 flex flex-col">
          <p className="text-white font-medium text-[16px]">
            <span className="blue-text-gradient">@</span> {name}
          </p>
          <p className="mt-1 text-secondary text-[12px]">
            {designation} of {company}
          </p>
        </div>
        <img
          src={image}
          alt={`feedback-by-${name}`}
          className="w-10 h-10 rounded-full object-cover"
        />
      </div>
    </motion.div>
  );
};

const Feedbacks = () => {
  const trackRef = useRef(null);
  const [canLeft, setCanLeft] = useState(false);
  const [canRight, setCanRight] = useState(false);

  // helper to set arrow visibility
  const updateArrows = () => {
    const el = trackRef.current;
    if (!el) return;
    setCanLeft(el.scrollLeft > 0);
    setCanRight(el.scrollLeft + el.clientWidth < el.scrollWidth - 1);
  };

  useEffect(() => {
    updateArrows();
    const el = trackRef.current;
    el?.addEventListener("scroll", updateArrows, { passive: true });
    window.addEventListener("resize", updateArrows);
    return () => {
      el?.removeEventListener("scroll", updateArrows);
      window.removeEventListener("resize", updateArrows);
    };
  }, []);

  const scrollByCard = (dir) => {
    const el = trackRef.current;
    if (!el) return;
    const card = el.querySelector("[data-card]");
    const cardWidth = card ? card.offsetWidth + 28 /*gap-7*/ : 320;
    el.scrollBy({ left: dir * cardWidth, behavior: "smooth" });
  };

  return (
    <div className="relative mt-12 bg-black-100 rounded-[20px]">
      {/* header */}
      <div className="bg-tertiary rounded-2xl min-h-[300px]">
        <motion.div variants={textVariant()}>
          <p className={`${styles.sectionSubText} pt-6 pl-6`}>What others say</p>
          <h2 className={`${styles.sectionHeadText} pl-6`}>Testimonials</h2>
        </motion.div>
      </div>

      {/* arrows */}
      {canLeft && (
        <button
          onClick={() => scrollByCard(-1)}
          className="absolute left-2 top-1/2 -translate-y-1/2 z-10
                     rounded-full bg-black/70 p-2 text-white hover:bg-black/90"
        >
          <ChevronLeft size={24} />
        </button>
      )}
      {canRight && (
        <button
          onClick={() => scrollByCard(1)}
          className="absolute right-2 top-1/2 -translate-y-1/2 z-10
                     rounded-full bg-black/70 p-2 text-white hover:bg-black/90"
        >
          <ChevronRight size={24} />
        </button>
      )}

      {/* track */}
      <div
        ref={trackRef}
        className={`${styles.paddingX} -mt-20 pb-14 flex gap-7
                    overflow-x-auto no-scrollbar scroll-smooth`}
      >
        {testimonials.map((t, i) => (
          <div key={t.name} data-card>
            <FeedbackCard index={i} {...t} />   {/* read-more inside */}
          </div>
        ))}
      </div>
    </div>
  );
};

export default SectionWrapper(Feedbacks, "feedback");