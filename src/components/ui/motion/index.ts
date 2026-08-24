/**
 * @file src/components/ui/motion/index.ts
 * @description Canonical entry point for all motion/animation utilities.
 *
 * Import from this path in new code:
 *   import { PageTransition, fadeInUp } from '@/components/ui/motion'
 *
 * The sibling barrel file ../motion.tsx remains for backward compatibility
 * but is marked @deprecated — it will be removed in a future cleanup.
 */

// Animation variants (CSS-class-free, pure framer-motion objects)
export {
  fadeInUp,
  fadeIn,
  scaleIn,
  slideInRight,
  slideInLeft,
  staggerContainer,
  staggerItem,
  neonReveal,
  staggeredNeonContainer,
  staggeredNeonItem,
} from './variants';

// Animated React components
/** Re-exported module members. */
export {
  PageTransition,
  NeonPageReveal,
  MotionCard,
  MotionButton,
  StaggeredList,
  StaggeredItem,
  MotionFadeIn,
  MotionSlideUp,
  MotionScale,
  MotionInteractive,
  SkeletonShimmer,
} from './components';

// Advanced animation effects
/** Re-exported module members. */
export {
  AnimatedCounter,
  AnimatedProgress,
  Presence,
  StaggerContainerEnhanced,
  SlideTransition,
  HoverScale,
  AnimatedList,
  AnimatedListItem,
  Typewriter,
} from './effects';

// Passthrough from framer-motion — todos os símbolos usados no projeto
// Permite migrar 'framer-motion' → '@/components/ui/motion' sem quebrar imports
export {
  AnimatePresence,
  motion,
  LayoutGroup,
  // hooks
  useReducedMotion,
  useMotionValue,
  useTransform,
  useSpring,
  useScroll,
  useAnimation,
} from 'framer-motion';
export type { Variants, Transition, PanInfo, HTMLMotionProps } from 'framer-motion';
