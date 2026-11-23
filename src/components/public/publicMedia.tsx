import React, { useState } from 'react';
import aboutStudioImg from '../../assets/images/about_architecture_systems_1795306658803.jpg';
import heroDashboardImg from '../../assets/images/edtech_hero_dashboard_1795356171864.jpg';
import campusHubImg from '../../assets/images/hero_edtech_campus_1795306658594.jpg';
import digitalClassroomImg from '../../assets/images/digital_classroom_cbt_1795457333613.jpg';
import adminDeskImg from '../../assets/images/school_admin_desk_1795457333099.jpg';
import { cn } from '../../lib/utils.ts';
import { Logo } from '../brand/Logo.tsx';

export const PUBLIC_MEDIA = {
  heroDashboardImg,
  campusHubImg,
  aboutStudioImg,
  digitalClassroomImg,
  adminDeskImg,
};

interface VisualMediaFrameProps {
  src: string;
  alt: string;
  fallbackTitle: string;
  className?: string;
  imgClassName?: string;
  children?: React.ReactNode;
}

export function VisualMediaFrame({
  src,
  alt,
  fallbackTitle,
  className,
  imgClassName,
  children,
}: VisualMediaFrameProps) {
  const [failed, setFailed] = useState(false);

  return (
    <div
      className={cn(
        'group relative overflow-hidden rounded-2xl border border-slate-200/80 bg-[#0F172A]',
        className,
      )}
    >
      {!failed ? (
        <img
          src={src}
          alt={alt}
          referrerPolicy="no-referrer"
          onError={() => setFailed(true)}
          className={cn(
            'h-full w-full object-cover transition-transform duration-500 ease-[cubic-bezier(0.16,1,0.3,1)] group-hover:scale-[1.035]',
            imgClassName,
          )}
        />
      ) : (
        <div className="flex h-full min-h-[240px] w-full flex-col items-center justify-center gap-3 bg-gradient-to-br from-[#0F172A] via-[#1E3A8A] to-[#2563EB] p-8 text-center text-white">
          <Logo variant="white" size="md" />
          <p className="text-sm font-medium text-blue-100">{fallbackTitle}</p>
        </div>
      )}
      {children}
    </div>
  );
}
