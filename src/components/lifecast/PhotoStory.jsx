import {useRef} from 'react';
import {motion,useScroll,useTransform,useReducedMotion} from 'framer-motion';
export default function PhotoStory({src,alt,children,className=''}){
 const ref=useRef(null), reduced=useReducedMotion();
 const {scrollYProgress}=useScroll({target:ref,offset:['start end','end start']});
 const y=useTransform(scrollYProgress,[0,1],className.includes('hero-photo')?['-3%','3%']:['-9%','9%']);
 return <section ref={ref} className={'photo-story '+className}><motion.img src={src} alt={alt} loading="lazy" style={{y:reduced?0:y}}/><div className="photo-scrim"/><div className="photo-copy">{children}</div></section>
}
