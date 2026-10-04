import { useEffect, useRef } from 'react';
import './realistic-avatar.css';

/** Portrait until a real video/MediaStream is supplied. No fake facial rig. */
export default function RealisticAvatar({ speaking, muted, videoUrl, mediaStream, videoRef, onPlaying, onEnded, onError }) {
  const localRef = useRef(null);
  const ref = videoRef || localRef;
  const hasVideo = Boolean(videoUrl || mediaStream);
  useEffect(() => {
    if (!ref.current) return;
    ref.current.srcObject = mediaStream || null;
    if (mediaStream) ref.current.play().catch(onError);
    return () => { if (ref.current) ref.current.srcObject = null; };
  }, [mediaStream]);
  return <div className="realistic-avatar" data-mode={hasVideo ? 'video' : 'portrait'}>
    {hasVideo ? <video muted={muted} ref={ref} src={mediaStream ? undefined : videoUrl} poster="/assets/lincoln-realistic.png" playsInline autoPlay onPlaying={onPlaying} onEnded={onEnded} onPause={onEnded} onError={onError} aria-label="Lincoln avatar video" /> : <img src="/assets/lincoln-realistic.png" alt="Photorealistic interpretation of Lincoln in a dark suit and bow tie" />}
    <div className="portrait-shade" />
    <div className="portrait-name"><span>LIFECAST GUIDE</span><strong>Lincoln</strong></div>
    <div className={'portrait-activity ' + (speaking ? 'is-speaking' : '')}>
      <span className="voice-bars" aria-hidden="true">{[0,1,2,3,4].map(n=><i key={n} style={{animationDelay:`${n * -.13}s`}} />)}</span>
      <span>{speaking ? hasVideo ? 'Speaking' : 'Voice playing' : 'Ready when you are'}</span>
    </div>
  </div>;
}
