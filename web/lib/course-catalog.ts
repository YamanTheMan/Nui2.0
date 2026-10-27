import type { IconName } from "@/components/ui-icon";

export type CourseMaterial = {
  source: string;
  title: string;
  category: string;
  description: string;
  icon: IconName;
  prompt: string;
  /** ISO calendar date for dated class updates. */
  date?: string;
};

export const COURSE_MATERIALS: readonly CourseMaterial[] = [
  {
    source: "D13_2026_09_16_class_update.txt",
    title: "September 16 class update",
    category: "Class updates",
    date: "2026-09-16",
    description: "Presentation dates, updated research requirements, and AI consultation hours.",
    icon: "book",
    prompt: "What are the updated Assignment 1 requirements and presentation dates from September 16?",
  },
  {
    source: "D01_course_overview.txt",
    title: "Your course guide",
    category: "Course essentials",
    description: "Grading, attendance, weekly topics, and course policies.",
    icon: "book",
    prompt:
      "Explain the grade distribution and what I should prioritize in this course.",
  },
  {
    source: "D02_assignments.txt",
    title: "Assignments & assessment",
    category: "Course essentials",
    description: "Requirements, rubrics, and deliverables, all in one place.",
    icon: "target",
    prompt:
      "Walk me through the requirements and deliverables for Assignment 1.",
  },
  {
    source: "D03_chapter1_strategy.txt",
    title: "Systems & strategy",
    category: "Core concepts",
    description: "The strategy triangle and competitive advantage.",
    icon: "layers",
    prompt:
      "Explain the Information Systems Strategy Triangle with an example.",
  },
  {
    source: "D04_chapter2_information_resources.txt",
    title: "Information resources",
    category: "Core concepts",
    description: "Strategic resources, capabilities, and the value chain.",
    icon: "layers",
    prompt: "How do information resources create competitive advantage?",
  },
  {
    source: "D05_chapter3_organizational_strategy.txt",
    title: "Organizational strategy",
    category: "Core concepts",
    description: "Managerial levers, structure, and organizational culture.",
    icon: "layers",
    prompt: "Explain managerial levers and how they support an IS strategy.",
  },
  {
    source: "D06_chapter4_work_design.txt",
    title: "Work & collaboration",
    category: "Core concepts",
    description: "Work design, virtual teams, and global collaboration.",
    icon: "globe",
    prompt:
      "What makes a virtual team effective according to our course notes?",
  },
  {
    source: "D07_chapter7_IT_costs.txt",
    title: "The economics of IT",
    category: "Core concepts",
    description: "IT costs, business cases, and investment decisions.",
    icon: "target",
    prompt:
      "Explain total cost of ownership and why it matters for IT investment.",
  },
  {
    source: "D08_cultural_IT_topics.txt",
    title: "Culture meets technology",
    category: "Frameworks & research",
    description: "Cross-cultural perspectives on technology adoption.",
    icon: "globe",
    prompt: "How does national culture influence technology adoption?",
  },
  {
    source: "D10_cultural_theories_scholarly.txt",
    title: "Cultural frameworks",
    category: "Frameworks & research",
    description: "Hofstede, Hall, GLOBE, and other cultural perspectives.",
    icon: "globe",
    prompt: "Compare Hofstede and Hall using the course materials.",
  },
  {
    source: "D11_it_adoption_theories_scholarly.txt",
    title: "Technology adoption",
    category: "Frameworks & research",
    description: "TAM, UTAUT, diffusion, and adoption models.",
    icon: "layers",
    prompt: "Compare TAM and UTAUT. When would I use each framework?",
  },
  {
    source: "D12_virtual_influencer_scholarly.txt",
    title: "Virtual influencers",
    category: "Frameworks & research",
    description: "Trust, authenticity, and why people follow digital creators.",
    icon: "spark",
    prompt:
      "Help me understand five factors influencing virtual influencer adoption.",
  },
] satisfies readonly CourseMaterial[];

export function sourceTitle(source: string): string {
  return (
    COURSE_MATERIALS.find((material) => material.source === source)?.title ??
    source
      .replace(/^D\d+_/, "")
      .replace(/\.txt$/, "")
      .replaceAll("_", " ")
  );
}
