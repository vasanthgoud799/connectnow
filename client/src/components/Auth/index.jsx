import { useEffect, useState } from "react";
import { SignIn, SignUp } from "@clerk/clerk-react";
import { AnimatePresence, motion, useScroll, useSpring } from "framer-motion";
import {
  BellRing,
  Bot,
  CalendarClock,
  CheckCircle2,
  Clock3,
  Crown,
  Languages,
  Lock,
  MessageSquareText,
  PhoneCall,
  ShieldCheck,
  Sparkles,
  Video,
  Wand2,
  Waves,
  Zap,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import PWAInstallPrompt from "@/components/PWAInstallPrompt";
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@/components/ui/tabs";

const heroHighlights = [
  "Smart replies inside the composer",
  "Friend-based private messaging",
  "Calls, groups, media, and polls",
  "Premium AI with built-in upgrades",
];

const featureGroups = [
  {
    icon: MessageSquareText,
    title: "Realtime chat",
    description: "Replies, reactions, forwards, search, polls, and a smoother conversation flow.",
  },
  {
    icon: ShieldCheck,
    title: "Friend-first social layer",
    description: "Friend requests, permissions, and invite flows make messaging feel intentional.",
  },
  {
    icon: PhoneCall,
    title: "Calls in the product",
    description: "Audio and video calling live directly inside the chat experience.",
  },
  {
    icon: Crown,
    title: "Premium AI",
    description: "Smart replies, translate, rewrite tone, summaries, and autocomplete for Premium users.",
  },
];

const aiFeatures = [
  { icon: Zap, title: "Smart replies" },
  { icon: Languages, title: "Translate messages" },
  { icon: Wand2, title: "Rewrite tone" },
  { icon: Bot, title: "Chat summaries" },
  { icon: Sparkles, title: "Autocomplete" },
];

const automations = [
  { icon: CalendarClock, title: "Scheduled messages" },
  { icon: BellRing, title: "Birthday reminders" },
  { icon: Clock3, title: "Event-aware nudges" },
];

const logos = ["Google", "Meta", "Microsoft", "Adobe", "Spotify"];

const testimonials = [
  {
    quote:
      "ConnectNow feels like a real product, not a prototype. The AI layer and messaging flow are incredibly polished.",
    name: "Ananya Rao",
    role: "Product Lead",
  },
  {
    quote:
      "The social permission model feels safer than typical chat apps, and the premium features make sense immediately.",
    name: "Rahul Mehta",
    role: "Growth Manager",
  },
  {
    quote:
      "Groups, calls, scheduling, and AI in one experience makes this feel like a premium communication platform.",
    name: "Sara Khan",
    role: "Operations Director",
  },
];

const clerkAppearance = {
  elements: {
    rootBox: "w-full max-w-full",
    card: "bg-transparent shadow-none border-none p-0",
    header: "hidden",
    headerTitle: "hidden",
    headerSubtitle: "hidden",
    socialButtonsBlockButton:
      "rounded-2xl border border-white/10 bg-white/[0.06] text-white hover:bg-white/[0.1] h-14",
    socialButtonsBlockButtonText: "font-medium text-white",
    dividerText: "text-slate-500",
    dividerLine: "bg-white/10",
    formFieldLabel: "text-slate-300 text-sm",
    formFieldInput:
      "h-14 rounded-2xl border border-white/10 bg-white/[0.05] text-white placeholder:text-slate-400",
    formFieldHintText: "text-slate-500",
    formButtonPrimary:
      "h-14 rounded-2xl bg-gradient-to-r from-[#8b5cf6] via-[#ec4899] to-[#22d3ee] text-white hover:opacity-95 shadow-[0_18px_44px_rgba(34,211,238,0.14)]",
    footer: "hidden",
    footerAction: "hidden",
    formResendCodeLink: "text-cyan-300 hover:text-cyan-200",
    identityPreviewText: "text-white",
    identityPreviewEditButton: "text-cyan-300",
    otpCodeFieldInput:
      "h-14 w-12 rounded-2xl border border-white/10 bg-white/[0.05] text-white",
    alertText: "text-slate-300",
    alertClerkError: "text-rose-300",
  },
};

function SectionTitle({ eyebrow, title, description }) {
  return (
    <div className="mb-10 text-center">
      <div className="section-kicker">{eyebrow}</div>
      <h2 className="mt-6 font-['Space_Grotesk'] text-4xl font-bold text-white md:text-5xl">
        {title}
      </h2>
      <p className="mx-auto mt-4 max-w-3xl text-base leading-8 text-slate-300 md:text-lg">
        {description}
      </p>
    </div>
  );
}

function FeatureCard({ icon: Icon, title, description }) {
  return (
    <motion.div whileHover={{ y: -6 }} className="feature-card rounded-[28px] p-6">
      <div className="flex h-14 w-14 items-center justify-center rounded-[20px] bg-gradient-to-br from-[#8b5cf6]/35 to-[#22d3ee]/35">
        <Icon className="h-6 w-6 text-white" />
      </div>
      <h3 className="mt-5 font-['Space_Grotesk'] text-2xl font-semibold text-white">
        {title}
      </h3>
      <p className="mt-3 text-sm leading-7 text-slate-300">{description}</p>
    </motion.div>
  );
}

function TestimonialCard({ quote, name, role }) {
  return (
    <motion.div whileHover={{ y: -5 }} className="landing-panel rounded-[28px] p-6">
      <p className="text-base leading-8 text-slate-200">&ldquo;{quote}&rdquo;</p>
      <div className="mt-6">
        <p className="font-['Space_Grotesk'] text-xl font-semibold text-white">
          {name}
        </p>
        <p className="mt-1 text-sm text-slate-400">{role}</p>
      </div>
    </motion.div>
  );
}

function PricingCard({
  title,
  price,
  subtitle,
  features,
  highlighted = false,
  cta,
  onClick,
}) {
  return (
    <motion.div
      whileHover={{ y: -6 }}
      className={`rounded-[34px] p-[1px] ${
        highlighted
          ? "bg-gradient-to-br from-[#8b5cf6] via-[#ec4899] to-[#22d3ee]"
          : "bg-white/10"
      }`}
    >
      <div className={`h-full rounded-[33px] p-8 ${highlighted ? "bg-[#090f1f]" : "bg-[rgba(7,15,28,0.86)]"}`}>
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="font-['Space_Grotesk'] text-3xl font-semibold text-white">
              {title}
            </p>
            <p className="mt-3 text-sm text-slate-400">{subtitle}</p>
          </div>
          {highlighted && (
            <div className="rounded-full border border-cyan-300/20 bg-cyan-300/10 px-3 py-1 text-xs text-cyan-100">
              Most popular
            </div>
          )}
        </div>

        <div className="mt-8">
          <div className="flex items-end gap-2">
            <span className="font-['Space_Grotesk'] text-5xl font-bold text-white">
              {price}
            </span>
            <span className="pb-1 text-sm text-slate-400">/ month</span>
          </div>
        </div>

        <div className="mt-8 space-y-4">
          {features.map((item) => (
            <div key={item} className="flex items-center gap-3">
              <CheckCircle2 className="h-5 w-5 text-emerald-300" />
              <span className="text-sm text-slate-200">{item}</span>
            </div>
          ))}
        </div>

        <Button
          onClick={onClick}
          className={`mt-10 h-14 w-full rounded-2xl ${
            highlighted
              ? "bg-gradient-to-r from-[#8b5cf6] via-[#ec4899] to-[#22d3ee] text-white"
              : "bg-white text-black hover:bg-slate-100"
          }`}
        >
          {cta}
        </Button>
      </div>
    </motion.div>
  );
}

function Auth() {
  const [heroIndex, setHeroIndex] = useState(0);
  const [activeTab, setActiveTab] = useState("login");

  const { scrollYProgress } = useScroll();
  const scaleX = useSpring(scrollYProgress, {
    stiffness: 90,
    damping: 20,
  });

  useEffect(() => {
    const id = setInterval(() => {
      setHeroIndex((prev) => (prev + 1) % heroHighlights.length);
    }, 2800);
    return () => clearInterval(id);
  }, []);

  const scrollToSection = (id) => {
    const element = document.getElementById(id);
    if (element) {
      element.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  };

  return (
    <div className="auth-premium-shell relative min-h-[100dvh] overflow-hidden bg-[#030712] text-white">
      <motion.div
        style={{ scaleX }}
        className="fixed left-0 top-0 z-50 h-1 w-full origin-left bg-gradient-to-r from-[#8b5cf6] via-[#ec4899] to-[#22d3ee]"
      />

      <div className="pointer-events-none absolute inset-0 overflow-hidden">
        <div className="landing-mesh absolute inset-0 opacity-40" />
        <div className="absolute -left-24 top-20 h-[28rem] w-[28rem] rounded-full bg-violet-500/12 blur-[160px]" />
        <div className="absolute right-[-6rem] top-24 h-[26rem] w-[26rem] rounded-full bg-cyan-400/14 blur-[150px]" />
        <div className="absolute bottom-[-10rem] left-1/3 h-[28rem] w-[28rem] rounded-full bg-pink-500/10 blur-[170px]" />
      </div>

      <header className="sticky top-0 z-40 border-b border-white/10 bg-[#030712]/75 backdrop-blur-xl">
        <div className="mx-auto flex max-w-7xl items-center justify-between gap-3 px-4 py-3 sm:px-6 sm:py-4">
          <div className="flex min-w-0 items-center gap-3">
            <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-gradient-to-br from-[#8b5cf6] via-[#ec4899] to-[#38bdf8] shadow-[0_18px_44px_rgba(56,189,248,0.18)]">
              <Waves className="h-5 w-5 text-white" />
            </div>
            <div className="min-w-0">
              <p className="truncate font-['Space_Grotesk'] text-lg font-semibold text-white sm:text-xl">
                ConnectNow
              </p>
              <p className="line-clamp-2 text-sm text-slate-400">
                AI-powered messaging platform
              </p>
            </div>
          </div>

          <nav className="hidden items-center gap-8 text-sm text-slate-300 lg:flex">
            <button onClick={() => scrollToSection("features")} className="transition hover:text-white">
              Features
            </button>
            <button onClick={() => scrollToSection("ai")} className="transition hover:text-white">
              AI
            </button>
            <button onClick={() => scrollToSection("pricing")} className="transition hover:text-white">
              Pricing
            </button>
            <button onClick={() => scrollToSection("auth-panel")} className="transition hover:text-white">
              Get Started
            </button>
          </nav>

          <div className="flex shrink-0 items-center gap-2 sm:gap-3">
            <div className="hidden sm:block">
              <PWAInstallPrompt compact />
            </div>
            <Button
              variant="outline"
              onClick={() => scrollToSection("pricing")}
              className="hidden rounded-full border-white/15 bg-white/5 px-5 text-white hover:bg-white/10 md:inline-flex"
            >
              Upgrade to Premium
            </Button>
            <Button
              onClick={() => scrollToSection("auth-panel")}
              className="rounded-full bg-gradient-to-r from-[#8b5cf6] via-[#ec4899] to-[#22d3ee] px-4 text-sm text-white sm:px-5 sm:text-base"
            >
              Get Started
            </Button>
          </div>
        </div>
      </header>

      <main className="relative z-10 overflow-x-hidden">
        <section className="mx-auto max-w-7xl overflow-x-hidden px-4 pb-20 pt-12 sm:px-6 lg:pb-28 lg:pt-20">
          <div className="grid items-center gap-10 lg:grid-cols-[0.98fr,1.02fr] lg:gap-14">
            <div className="min-w-0 overflow-hidden">
              <div className="section-kicker max-w-full overflow-hidden text-[10px] tracking-[0.24em] sm:text-xs">
                AI-Powered Messaging Platform
              </div>
              <h1 className="mt-6 max-w-full break-words font-['Space_Grotesk'] text-4xl font-bold leading-[0.95] text-white sm:text-5xl md:mt-8 md:text-7xl">
                Connect Smarter. Chat Faster. Do More.
              </h1>
              <p className="mt-5 max-w-2xl text-base leading-7 text-slate-300 sm:text-lg md:mt-6 md:text-2xl md:leading-8">
                Real-time chat, AI assistant, calls, and social features - all in one powerful platform.
              </p>

              <AnimatePresence mode="wait">
                <motion.div
                  key={heroIndex}
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -10 }}
                  transition={{ duration: 0.3 }}
                  className="mt-7 inline-flex max-w-full rounded-full border border-cyan-300/20 bg-cyan-300/10 px-4 py-2 text-sm text-cyan-100"
                >
                  <span className="truncate">{heroHighlights[heroIndex]}</span>
                </motion.div>
              </AnimatePresence>

              <div className="mt-8 flex flex-col gap-3 sm:mt-10 sm:flex-row sm:flex-wrap sm:gap-4">
                <Button
                  onClick={() => scrollToSection("auth-panel")}
                  className="w-full rounded-full bg-gradient-to-r from-[#8b5cf6] via-[#ec4899] to-[#22d3ee] px-7 py-6 text-base text-white shadow-[0_20px_54px_rgba(34,211,238,0.18)] sm:w-auto"
                >
                  Get Started
                </Button>
                <Button
                  variant="outline"
                  onClick={() => scrollToSection("pricing")}
                  className="w-full rounded-full border-white/15 bg-white/5 px-7 py-6 text-base text-white hover:bg-white/10 sm:w-auto"
                >
                  Upgrade to Premium
                </Button>
              </div>
            </div>

            <motion.div
              initial={{ opacity: 0, y: 30, rotateX: 5 }}
              animate={{ opacity: 1, y: 0, rotateX: 0 }}
              transition={{ duration: 0.65 }}
              className="hidden landing-3d-card rounded-[38px] p-4 lg:block"
            >
              <div className="landing-panel rounded-[32px] p-5">
                <div className="mb-5 flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-gradient-to-br from-[#8b5cf6] via-[#ec4899] to-[#38bdf8] text-xl font-semibold text-white">
                      C
                    </div>
                    <div>
                      <p className="font-['Space_Grotesk'] text-2xl font-semibold text-white">
                        ConnectNow
                      </p>
                      <p className="text-sm text-slate-400">Premium chat workspace</p>
                    </div>
                  </div>
                  <div className="rounded-full border border-emerald-400/20 bg-emerald-400/10 px-3 py-1 text-xs text-emerald-200">
                    Online now
                  </div>
                </div>

                <div className="grid gap-4 lg:grid-cols-[0.9fr,1.1fr]">
                  <div className="rounded-[26px] border border-white/8 bg-black/10 p-4">
                    <div className="mb-4 rounded-[22px] border border-white/8 bg-white/[0.04] px-4 py-3 text-sm text-slate-400">
                      Search conversations...
                    </div>
                    <div className="space-y-3">
                      {[
                        { name: "Design Team", text: "Poll: approve the new launch deck?", time: "Now", active: true },
                        { name: "Vinay", text: "AI summary is ready for this chat", time: "12:24" },
                        { name: "Family Group", text: "Voice note attached", time: "11:18" },
                      ].map((chat) => (
                        <div
                          key={chat.name}
                          className={`rounded-[22px] border px-4 py-4 ${
                            chat.active
                              ? "border-cyan-300/20 bg-gradient-to-r from-white/[0.08] to-cyan-400/[0.06]"
                              : "border-white/8 bg-white/[0.03]"
                          }`}
                        >
                          <div className="flex items-start justify-between gap-4">
                            <div className="min-w-0">
                              <p className="truncate font-medium text-white">{chat.name}</p>
                              <p className="mt-1 truncate text-sm text-slate-400">{chat.text}</p>
                            </div>
                            <span className="shrink-0 text-xs text-slate-500">{chat.time}</span>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>

                  <div className="rounded-[26px] border border-white/8 bg-black/10 p-4">
                    <div className="mb-4 flex items-center justify-between">
                      <div>
                        <p className="font-['Space_Grotesk'] text-2xl font-semibold text-white">
                          ConnectNow Chat
                        </p>
                        <p className="text-sm text-cyan-200">Messages + AI suggestions + reactions</p>
                      </div>
                      <div className="flex gap-2">
                        <div className="rounded-2xl border border-white/8 bg-white/[0.05] p-3">
                          <PhoneCall className="h-4 w-4 text-slate-300" />
                        </div>
                        <div className="rounded-2xl border border-white/8 bg-white/[0.05] p-3">
                          <Video className="h-4 w-4 text-slate-300" />
                        </div>
                      </div>
                    </div>

                    <div className="space-y-4">
                      <div className="max-w-[82%] rounded-[24px] border border-white/8 bg-white/[0.06] px-4 py-3 text-white">
                        We should send the invite later today. Also translate this reply to Hindi.
                      </div>
                      <div className="ml-auto max-w-[86%] rounded-[24px] bg-gradient-to-r from-[#f472b6] via-[#fb923c] to-[#38bdf8] px-4 py-3 text-white">
                        Summarize this chat and rewrite my response in a friendly tone.
                      </div>
                      <div className="rounded-[24px] border border-cyan-300/18 bg-cyan-400/[0.08] p-4">
                        <div className="flex items-center gap-3">
                          <Bot className="h-5 w-5 text-cyan-200" />
                          <div>
                            <p className="font-medium text-white">AI suggestions</p>
                            <p className="text-sm text-slate-400">
                              Smart replies generated live inside the composer
                            </p>
                          </div>
                        </div>
                        <div className="mt-4 flex flex-wrap gap-2">
                          {[
                            "Looks good to me.",
                            "Let me check and confirm.",
                            "I'll send the invite now.",
                          ].map((chip) => (
                            <div
                              key={chip}
                              className="rounded-full border border-white/10 bg-white/[0.06] px-3 py-2 text-xs text-slate-200"
                            >
                              {chip}
                            </div>
                          ))}
                        </div>
                      </div>
                    </div>

                    <div className="mt-4 rounded-[24px] border border-white/8 bg-white/[0.05] px-4 py-4 text-sm text-slate-300">
                      Type a message... <span className="ml-2 text-cyan-200">AI assist enabled</span>
                    </div>
                  </div>
                </div>
              </div>
            </motion.div>
          </div>
        </section>

        <section className="mx-auto max-w-7xl overflow-x-hidden px-4 pb-20 sm:px-6 md:pb-24" id="trust">
          <SectionTitle
            eyebrow="Trusted by growing teams"
            title="Used by 10,000+ users"
            description="From close-knit communities to fast-moving teams, ConnectNow is designed to feel premium, social, and fast."
          />

          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
            {logos.map((logo) => (
              <div
                key={logo}
                className="rounded-2xl border border-white/10 bg-white/[0.04] px-4 py-4 text-center text-sm font-medium text-slate-300"
              >
                {logo}
              </div>
            ))}
          </div>

          <div className="mt-8 grid gap-6 md:grid-cols-2 xl:grid-cols-3">
            {testimonials.map((item) => (
              <TestimonialCard key={item.name} {...item} />
            ))}
          </div>
        </section>

        <section id="features" className="mx-auto max-w-7xl overflow-x-hidden px-4 pb-20 sm:px-6 md:pb-24">
          <SectionTitle
            eyebrow="Everything in one workspace"
            title="Built for modern communication"
            description="Messaging, social permissions, groups, media, calls, and premium AI are all part of one cohesive product."
          />

          <div className="grid gap-6 md:grid-cols-2 xl:grid-cols-4">
            {featureGroups.map((feature) => (
              <FeatureCard key={feature.title} {...feature} />
            ))}
          </div>
        </section>

        <section id="ai" className="mx-auto max-w-7xl overflow-x-hidden px-4 pb-20 sm:px-6 md:pb-24">
          <div className="grid gap-8 lg:grid-cols-[0.95fr,1.05fr]">
            <div className="landing-panel rounded-[36px] p-8 lg:p-10">
              <div className="section-kicker">Premium AI</div>
              <h2 className="mt-6 font-['Space_Grotesk'] text-4xl font-bold text-white md:text-5xl">
                AI that thinks with you
              </h2>
              <p className="mt-4 max-w-2xl text-base leading-8 text-slate-300 md:text-lg">
                ConnectNow&apos;s AI features live where users actually need them: inside the composer, message actions, and long conversation catch-up moments.
              </p>

              <Button
                onClick={() => scrollToSection("pricing")}
                className="mt-8 rounded-full bg-gradient-to-r from-[#8b5cf6] via-[#ec4899] to-[#22d3ee] px-7 py-6 text-base text-white"
              >
                Unlock AI
              </Button>
            </div>

            <div className="grid gap-5 sm:grid-cols-2">
              {aiFeatures.map(({ icon: Icon, title }) => (
                <div key={title} className="landing-panel rounded-[28px] p-6">
                  <div className="mb-4 flex items-center justify-between">
                    <div className="flex h-12 w-12 items-center justify-center rounded-[18px] bg-gradient-to-br from-[#8b5cf6]/35 to-[#22d3ee]/30">
                      <Icon className="h-5 w-5 text-white" />
                    </div>
                    <div className="inline-flex items-center gap-2 rounded-full border border-amber-300/20 bg-amber-300/10 px-3 py-1 text-xs text-amber-100">
                      <Lock className="h-3.5 w-3.5" />
                      Premium Feature
                    </div>
                  </div>
                  <h3 className="font-['Space_Grotesk'] text-2xl font-semibold text-white">
                    {title}
                  </h3>
                </div>
              ))}
            </div>
          </div>
        </section>

        <section className="mx-auto max-w-7xl overflow-x-hidden px-4 pb-20 sm:px-6 md:pb-24">
          <SectionTitle
            eyebrow="Smart automation"
            title="Automation that keeps conversations moving"
            description="Reduce missed moments and create better follow-through with built-in scheduling and event-aware prompts."
          />

          <div className="grid gap-6 md:grid-cols-3">
            {automations.map(({ icon: Icon, title }) => (
              <div key={title} className="landing-panel rounded-[30px] p-6">
                <div className="flex h-14 w-14 items-center justify-center rounded-[20px] bg-gradient-to-br from-[#8b5cf6]/35 to-[#22d3ee]/35">
                  <Icon className="h-6 w-6 text-white" />
                </div>
                <h3 className="mt-5 font-['Space_Grotesk'] text-2xl font-semibold text-white">
                  {title}
                </h3>
              </div>
            ))}
          </div>
        </section>

        <section id="pricing" className="mx-auto max-w-7xl overflow-x-hidden px-4 pb-20 sm:px-6 md:pb-24">
          <SectionTitle
            eyebrow="Pricing"
            title="Simple plans, premium value"
            description="Start with the core messaging platform for free, then unlock premium AI and automation when you're ready."
          />

          <div className="grid gap-6 lg:grid-cols-2">
            <PricingCard
              title="Free"
              price="Rs.0"
              subtitle="Great for everyday chat, groups, and calling."
              features={[
                "Basic chat and messaging",
                "Groups and invite flows",
                "Audio and video calls",
                "Notifications and media sharing",
              ]}
              cta="Get Started"
              onClick={() => scrollToSection("auth-panel")}
            />

            <PricingCard
              title="Premium"
              price="Rs.299"
              subtitle="Unlock AI features, smart automation, and a faster premium experience."
              features={[
                "Smart replies and autocomplete",
                "Translate and rewrite tone",
                "Chat summaries",
                "Smart automation and scheduling",
              ]}
              highlighted
              cta="Upgrade to Premium"
              onClick={() => scrollToSection("auth-panel")}
            />
          </div>
        </section>

        <section id="auth-panel" className="mx-auto max-w-7xl overflow-x-hidden px-3 pb-20 sm:px-6">
          <div className="mx-auto max-w-3xl">
            <div className="landing-panel rounded-[28px] p-3 shadow-[0_30px_90px_rgba(2,8,23,0.35)] md:rounded-[42px] md:p-6">
              <div className="mb-4 text-center md:mb-6">
                <div className="section-kicker">Get started</div>
                <h2 className="mt-5 font-['Space_Grotesk'] text-3xl font-bold text-white md:mt-6 md:text-5xl">
                  Continue with ConnectNow
                </h2>
                <p className="mx-auto mt-3 max-w-2xl text-sm leading-6 text-slate-300 md:mt-4 md:text-base md:leading-7">
                  Sign in or create your account to continue into your messages,
                  calls, groups, and premium AI workspace.
                </p>
              </div>

              <div className="overflow-hidden rounded-[24px] border border-white/10 bg-black/10 p-2 backdrop-blur-2xl md:rounded-[34px] md:p-6">
                <Tabs value={activeTab} onValueChange={setActiveTab}>
                  <TabsList className="grid grid-cols-2 rounded-full bg-white/[0.06] p-1.5">
                    <TabsTrigger value="login">Sign in</TabsTrigger>
                    <TabsTrigger value="signup">Create account</TabsTrigger>
                  </TabsList>

                  <TabsContent value="login" className="mt-5 md:mt-8">
                    <div className="clerk-surface min-w-0 overflow-hidden rounded-[22px] p-3 md:rounded-[28px] md:p-5">
                      <div className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                        <div>
                          <p className="font-['Space_Grotesk'] text-xl font-semibold text-white md:text-2xl">
                            Welcome back
                          </p>
                          <p className="mt-1 text-sm text-slate-400">
                            Access your messages, calls, groups, and AI tools.
                          </p>
                        </div>
                        <div className="w-fit rounded-full border border-emerald-400/20 bg-emerald-400/10 px-3 py-1 text-xs text-emerald-200">
                          Secure
                        </div>
                      </div>

                      <SignIn
                        routing="virtual"
                        forceRedirectUrl="/home"
                        appearance={clerkAppearance}
                      />
                    </div>
                  </TabsContent>

                  <TabsContent value="signup" className="mt-5 md:mt-8">
                    <div className="clerk-surface min-w-0 overflow-hidden rounded-[22px] p-3 md:rounded-[28px] md:p-5">
                      <div className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                        <div>
                          <p className="font-['Space_Grotesk'] text-xl font-semibold text-white md:text-2xl">
                            Create account
                          </p>
                          <p className="mt-1 text-sm text-slate-400">
                            Set up your ConnectNow identity with Clerk.
                          </p>
                        </div>
                        <div className="w-fit rounded-full border border-cyan-300/20 bg-cyan-300/10 px-3 py-1 text-xs text-cyan-200">
                          New user
                        </div>
                      </div>

                      <SignUp
                        routing="virtual"
                        forceRedirectUrl="/home"
                        appearance={{
                          ...clerkAppearance,
                          elements: {
                            ...clerkAppearance.elements,
                            formButtonPrimary:
                              "h-14 rounded-2xl bg-white text-black hover:bg-slate-100 shadow-[0_18px_44px_rgba(255,255,255,0.08)]",
                          },
                        }}
                      />
                    </div>
                  </TabsContent>
                </Tabs>
              </div>
            </div>
          </div>
        </section>

        <section className="mx-auto max-w-7xl overflow-x-hidden px-4 pb-14 sm:px-6 md:pb-16">
          <div className="landing-panel rounded-[28px] px-4 py-10 text-center sm:px-8 sm:py-12 sm:rounded-[40px]">
            <h2 className="font-['Space_Grotesk'] text-3xl font-bold text-white md:text-5xl">
              Start Connecting Smarter Today
            </h2>
            <p className="mx-auto mt-4 max-w-3xl text-sm leading-7 text-slate-300 md:text-lg md:leading-8">
              Bring together messaging, social connection, calls, scheduling, and premium AI in one polished platform.
            </p>
            <div className="mt-8 flex flex-col justify-center gap-3 sm:flex-row sm:flex-wrap sm:gap-4">
              <Button
                onClick={() => scrollToSection("auth-panel")}
                className="w-full rounded-full bg-white px-7 py-6 text-base text-black hover:bg-slate-100 sm:w-auto"
              >
                Get Started
              </Button>
              <Button
                variant="outline"
                onClick={() => scrollToSection("pricing")}
                className="w-full rounded-full border-white/15 bg-white/5 px-7 py-6 text-base text-white hover:bg-white/10 sm:w-auto"
              >
                Try Premium
              </Button>
            </div>
          </div>
        </section>
      </main>

      
    </div>
  );
}
export default Auth;
