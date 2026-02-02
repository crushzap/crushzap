import { LandingCtaSection } from "@/components/landing/LandingCtaSection";
import { LandingFeaturesSection } from "@/components/landing/LandingFeaturesSection";
import { LandingFooter } from "@/components/landing/LandingFooter";
import { LandingHero } from "@/components/landing/LandingHero";
import { LandingHowItWorksSection } from "@/components/landing/LandingHowItWorksSection";
import { LandingNavbar } from "@/components/landing/LandingNavbar";
import { LandingPricingSection } from "@/components/landing/LandingPricingSection";
import { LandingTestimonialsSection } from "@/components/landing/LandingTestimonialsSection";

export default function Landing() {
  return (
    <div className="min-h-screen bg-background">
      <LandingNavbar />
      <LandingHero />
      <LandingFeaturesSection />
      <LandingHowItWorksSection />
      <LandingTestimonialsSection />
      <LandingPricingSection />
      <LandingCtaSection />
      <LandingFooter />
    </div>
  );
}
