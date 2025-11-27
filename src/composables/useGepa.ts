import { ref } from 'vue'
import { generateText } from '../services/ai'

/**
 * Evaluation dimension for GEPA multi-criteria assessment
 */
interface GepaDimension {
  name: string
  description: string
  weight: number
}

/**
 * Trace entry capturing specific examples from generated content
 */
interface GepaTrace {
  dimension: string
  score: number
  evidence: string[]
  failures: string[]
  successes: string[]
}

/**
 * Reflection result from analyzing traces
 */
interface GepaReflection {
  traces: GepaTrace[]
  overallScore: number
  priorityFix: string
  mutations: GepaMutation[]
}

/**
 * Targeted mutation to apply during improvement
 */
interface GepaMutation {
  target: string
  issue: string
  suggestion: string
  rationale: string
}

/**
 * Configuration for a GEPA optimization task
 */
interface GepaConfig<T> {
  /** Name of the optimization task */
  taskName: string
  /** Evaluation dimensions with weights */
  dimensions: readonly GepaDimension[] | GepaDimension[]
  /** Function to serialize candidate for prompts */
  serialize: (candidate: T) => string
  /** Function to parse improved candidate from AI response */
  parse: (response: string) => T
  /** Optional context to include in all prompts */
  context?: string
  /** Maximum iterations (default: 2) */
  maxIterations?: number
  /** Minimum score threshold to stop early (0-1, default: 0.85) */
  targetScore?: number
}

/**
 * Result from a GEPA optimization run
 */
interface GepaResult<T> {
  original: T
  improved: T
  iterations: number
  finalScore: number
  reflections: GepaReflection[]
}

/**
 * Builds the evaluation prompt for extracting traces
 */
function buildEvaluationPrompt(dimensions: readonly GepaDimension[], context?: string): string {
  const dimensionList = dimensions
    .map((d, i) => `${i + 1}. **${d.name}** (weight: ${d.weight}): ${d.description}`)
    .join('\n')

  return `You are an expert evaluator performing multi-dimensional assessment using the GEPA (Genetic-Pareto) framework.

TASK: Analyze the provided content and extract execution traces for each evaluation dimension.

${context ? `CONTEXT:\n${context}\n` : ''}
EVALUATION DIMENSIONS:
${dimensionList}

For each dimension, you must:
1. Score it from 0-10
2. Extract CONCRETE EVIDENCE from the content (direct quotes or specific observations)
3. Identify specific FAILURES (with exact quotes showing the problem)
4. Identify specific SUCCESSES (with exact quotes showing what works)

OUTPUT FORMAT (JSON):
{
  "traces": [
    {
      "dimension": "dimension name",
      "score": 7,
      "evidence": ["quote or observation from content"],
      "failures": ["specific failure with quote: 'problematic text'"],
      "successes": ["specific success with quote: 'good text'"]
    }
  ],
  "overallScore": 7.5,
  "priorityFix": "The single most impactful improvement to make",
  "mutations": [
    {
      "target": "what to change",
      "issue": "why it's problematic",
      "suggestion": "specific replacement or fix",
      "rationale": "why this mutation will improve the score"
    }
  ]
}

CRITICAL RULES:
- Always include direct quotes as evidence
- Failures must cite the exact problematic text
- Mutations must be actionable and specific
- Overall score is weighted average of dimension scores

Output ONLY the JSON object.`
}

/**
 * Builds the improvement prompt incorporating reflection feedback
 */
function buildImprovementPrompt<T>(
  config: GepaConfig<T>,
  candidate: T,
  reflection: GepaReflection
): string {
  const mutationList = reflection.mutations
    .map((m, i) => `${i + 1}. **${m.target}**: ${m.issue}\n   → ${m.suggestion}\n   Rationale: ${m.rationale}`)
    .join('\n\n')

  const tracesSummary = reflection.traces
    .map(t => `- ${t.dimension}: ${t.score}/10 | Failures: ${t.failures.length} | Successes: ${t.successes.length}`)
    .join('\n')

  return `You are an expert optimizer applying targeted mutations using the GEPA framework.

TASK: Improve the content by applying the mutations identified through reflection.

${config.context ? `CONTEXT:\n${config.context}\n` : ''}
CURRENT CONTENT:
${config.serialize(candidate)}

EVALUATION TRACES:
${tracesSummary}

PRIORITY FIX: ${reflection.priorityFix}

TARGETED MUTATIONS TO APPLY:
${mutationList}

IMPROVEMENT RULES:
1. Address the PRIORITY FIX first
2. Apply each mutation precisely as suggested
3. Preserve what's working (the successes identified)
4. Maintain the same format and structure
5. Do not introduce new issues while fixing old ones

OUTPUT: Return ONLY the improved content in the same format as the input. No explanations or commentary.`
}

/**
 * Parses the evaluation response into a GepaReflection
 */
function parseReflection(response: string): GepaReflection {
  const cleaned = response
    .replace(/```json\s*/g, '')
    .replace(/```\s*/g, '')
    .trim()

  const parsed = JSON.parse(cleaned)

  return {
    traces: parsed.traces || [],
    overallScore: parsed.overallScore || 0,
    priorityFix: parsed.priorityFix || '',
    mutations: parsed.mutations || []
  }
}

/**
 * GEPA Composable - Generic system for reflective text evolution
 * 
 * Implements the GEPA (Genetic-Pareto) optimization framework:
 * 1. Generate initial candidate
 * 2. Evaluate across multiple dimensions, extracting execution traces
 * 3. Reflect on traces to identify targeted mutations
 * 4. Apply mutations to produce improved candidate
 * 5. Repeat until target score reached or max iterations
 * 
 * @example
 * ```ts
 * const { optimize, isOptimizing, progress } = useGepa()
 * 
 * const result = await optimize(initialTerms, {
 *   taskName: 'terminology',
 *   dimensions: [
 *     { name: 'Uniqueness', description: 'Terms are specific to this world', weight: 0.3 },
 *     { name: 'Consistency', description: 'Terms fit the genre/tone', weight: 0.3 },
 *     { name: 'Clarity', description: 'Definitions are clear', weight: 0.2 },
 *     { name: 'Necessity', description: 'Terms are needed for the story', weight: 0.2 }
 *   ],
 *   serialize: (terms) => JSON.stringify(terms, null, 2),
 *   parse: (response) => JSON.parse(response),
 *   context: `Genre: ${genre}\nTheme: ${theme}`
 * })
 * ```
 */
export function useGepa() {
  const isOptimizing = ref(false)
  const progress = ref<{ iteration: number; phase: string; score: number }>({
    iteration: 0,
    phase: 'idle',
    score: 0
  })

  /**
   * Run GEPA optimization on a candidate
   */
  async function optimize<T>(
    candidate: T,
    config: GepaConfig<T>
  ): Promise<GepaResult<T>> {
    const maxIterations = config.maxIterations ?? 2
    const targetScore = config.targetScore ?? 0.85

    isOptimizing.value = true
    const reflections: GepaReflection[] = []
    let current = candidate
    let iteration = 0
    let finalScore = 0

    try {
      while (iteration < maxIterations) {
        iteration++

        // Phase 1: Evaluate - Extract execution traces
        progress.value = { iteration, phase: 'evaluating', score: finalScore }

        const evalPrompt = buildEvaluationPrompt(config.dimensions, config.context)
        const evalResponse = await generateText(
          evalPrompt,
          `Evaluate this ${config.taskName}:\n\n${config.serialize(current)}`
        )

        const reflection = parseReflection(evalResponse)
        reflections.push(reflection)
        finalScore = reflection.overallScore / 10

        // Check if we've reached target score
        if (finalScore >= targetScore) {
          progress.value = { iteration, phase: 'complete', score: finalScore }
          break
        }

        // Phase 2: Improve - Apply targeted mutations
        progress.value = { iteration, phase: 'improving', score: finalScore }

        const improvePrompt = buildImprovementPrompt(config, current, reflection)
        const improveResponse = await generateText(improvePrompt, '')

        try {
          current = config.parse(improveResponse)
        } catch (parseError) {
          console.warn(`GEPA iteration ${iteration}: Failed to parse improvement, keeping current`, parseError)
          break
        }
      }

      progress.value = { iteration, phase: 'complete', score: finalScore }

      return {
        original: candidate,
        improved: current,
        iterations: iteration,
        finalScore,
        reflections
      }
    } finally {
      isOptimizing.value = false
    }
  }

  /**
   * Single evaluation pass without improvement (useful for analysis)
   */
  async function evaluate<T>(
    candidate: T,
    config: Pick<GepaConfig<T>, 'taskName' | 'dimensions' | 'serialize' | 'context'>
  ): Promise<GepaReflection> {
    const evalPrompt = buildEvaluationPrompt(config.dimensions, config.context)
    const evalResponse = await generateText(
      evalPrompt,
      `Evaluate this ${config.taskName}:\n\n${config.serialize(candidate)}`
    )
    return parseReflection(evalResponse)
  }

  /**
   * Optimize a SYSTEM PROMPT itself based on execution traces
   * This is the core GEPA approach - improving prompts through reflection
   */
  async function optimizePrompt(config: {
    /** The current system prompt to optimize */
    systemPrompt: string
    /** Name/purpose of the prompt */
    promptName: string
    /** Sample input to test the prompt with */
    sampleInput: string
    /** Evaluation dimensions for the output */
    dimensions: readonly GepaDimension[] | GepaDimension[]
    /** Additional context about what the prompt should achieve */
    taskDescription: string
    /** Max iterations */
    maxIterations?: number
  }): Promise<{
    originalPrompt: string
    improvedPrompt: string
    sampleOutput: string
    improvedOutput: string
    iterations: number
    finalScore: number
    promptMutations: string[]
  }> {
    const maxIterations = config.maxIterations ?? 2
    isOptimizing.value = true
    let currentPrompt = config.systemPrompt
    let sampleOutput = ''
    let finalScore = 0
    const promptMutations: string[] = []

    try {
      for (let iteration = 1; iteration <= maxIterations; iteration++) {
        // Phase 1: EXECUTE - Run the prompt to generate output
        progress.value = { iteration, phase: 'executing', score: finalScore }
        sampleOutput = await generateText(currentPrompt, config.sampleInput)

        // Phase 2: EVALUATE - Score the output
        progress.value = { iteration, phase: 'evaluating', score: finalScore }
        const evalPrompt = buildEvaluationPrompt(config.dimensions)
        const evalResponse = await generateText(
          evalPrompt,
          `Evaluate this output from a "${config.promptName}" prompt:\n\n${sampleOutput}`
        )
        const reflection = parseReflection(evalResponse)
        finalScore = reflection.overallScore / 10

        if (finalScore >= 0.85) {
          progress.value = { iteration, phase: 'complete', score: finalScore }
          break
        }

        // Phase 3: REFLECT ON PROMPT - Identify prompt weaknesses
        progress.value = { iteration, phase: 'reflecting', score: finalScore }
        const reflectPrompt = buildPromptReflectionPrompt(config.taskDescription)
        const reflectResponse = await generateText(
          reflectPrompt,
          `CURRENT PROMPT:\n${currentPrompt}\n\nOUTPUT PRODUCED:\n${sampleOutput}\n\nOUTPUT EVALUATION:\n- Score: ${reflection.overallScore}/10\n- Issues: ${reflection.mutations.map(m => m.issue).join('; ')}\n- Priority Fix: ${reflection.priorityFix}`
        )

        // Phase 4: MUTATE PROMPT - Generate improved prompt
        progress.value = { iteration, phase: 'mutating', score: finalScore }
        const mutatePrompt = buildPromptMutationPrompt()
        const mutateResponse = await generateText(
          mutatePrompt,
          `ORIGINAL PROMPT:\n${currentPrompt}\n\nREFLECTION ON WEAKNESSES:\n${reflectResponse}\n\nTASK: ${config.taskDescription}`
        )

        // Extract improved prompt
        const improvedPrompt = extractImprovedPrompt(mutateResponse)
        if (improvedPrompt && improvedPrompt !== currentPrompt) {
          promptMutations.push(`Iteration ${iteration}: ${reflection.priorityFix}`)
          currentPrompt = improvedPrompt
        } else {
          break
        }
      }

      // Generate final output with improved prompt
      const improvedOutput = currentPrompt !== config.systemPrompt 
        ? await generateText(currentPrompt, config.sampleInput)
        : sampleOutput

      progress.value = { iteration: maxIterations, phase: 'complete', score: finalScore }

      return {
        originalPrompt: config.systemPrompt,
        improvedPrompt: currentPrompt,
        sampleOutput,
        improvedOutput,
        iterations: promptMutations.length + 1,
        finalScore,
        promptMutations
      }
    } finally {
      isOptimizing.value = false
    }
  }

  return {
    optimize,
    optimizePrompt,
    evaluate,
    isOptimizing,
    progress
  }
}

/**
 * Builds prompt for reflecting on system prompt weaknesses
 */
function buildPromptReflectionPrompt(taskDescription: string): string {
  return `You are a prompt engineering expert analyzing why a system prompt produced suboptimal output.

TASK THE PROMPT SHOULD ACCOMPLISH:
${taskDescription}

Analyze the prompt and its output to identify:
1. What instructions are MISSING that would have improved the output?
2. What instructions are VAGUE and need to be more specific?
3. What instructions are COUNTERPRODUCTIVE and should be removed/changed?
4. What PATTERNS in the output failures suggest prompt weaknesses?

OUTPUT FORMAT:
Provide a detailed analysis of prompt weaknesses, focusing on:
- Missing instructions (what should be added)
- Vague instructions (what needs clarification)
- Counterproductive instructions (what should change)
- Specific examples of how the prompt failed

Be concrete and actionable. Reference specific parts of the prompt and output.`
}

/**
 * Builds prompt for mutating/improving a system prompt
 */
function buildPromptMutationPrompt(): string {
  return `You are a prompt engineering expert improving a system prompt based on reflection feedback.

YOUR TASK: Rewrite the prompt to address the identified weaknesses.

MUTATION RULES:
1. PRESERVE the core intent and format requirements
2. ADD specific instructions for identified gaps
3. CLARIFY vague instructions with concrete examples
4. REMOVE or REPHRASE counterproductive instructions
5. ADD guardrails against the specific failure patterns observed
6. Keep the prompt concise - don't over-engineer

OUTPUT FORMAT:
Return ONLY the improved prompt text. No explanations or commentary.
Start directly with the improved prompt content.`
}

/**
 * Extracts the improved prompt from the mutation response
 */
function extractImprovedPrompt(response: string): string {
  // Clean up any markdown formatting
  let cleaned = response
    .replace(/^```[a-z]*\n?/gm, '')
    .replace(/```$/gm, '')
    .trim()
  
  // Remove any preamble like "Here is the improved prompt:"
  const preamblePatterns = [
    /^(?:here is|here's|the improved|improved prompt|new prompt)[:\s]*/i,
    /^(?:revised|updated|modified)[:\s]*/i
  ]
  for (const pattern of preamblePatterns) {
    cleaned = cleaned.replace(pattern, '')
  }
  
  return cleaned.trim()
}

/**
 * Pre-built dimension configurations for common use cases
 */
export const GEPA_DIMENSIONS = {
  terminology: [
    { name: 'Uniqueness', description: 'Terms are specific and evocative for this world, not generic', weight: 0.3 },
    { name: 'Consistency', description: 'Terms fit the genre, tone, and established lore', weight: 0.25 },
    { name: 'Clarity', description: 'Definitions are clear, concise, and unambiguous', weight: 0.2 },
    { name: 'Necessity', description: 'Each term serves a purpose and enriches the story', weight: 0.15 },
    { name: 'Memorability', description: 'Terms are distinctive and easy to remember', weight: 0.1 }
  ],

  chapter: [
    { name: 'Continuity', description: 'Events flow logically from previous chapters', weight: 0.25 },
    { name: 'Character Voice', description: 'Characters speak and act consistently with their established traits', weight: 0.2 },
    { name: 'Pacing', description: 'Scene rhythm is appropriate, neither rushed nor draggy', weight: 0.15 },
    { name: 'Tension', description: 'Conflict and stakes are maintained throughout', weight: 0.15 },
    { name: 'Sensory Detail', description: 'Rich, specific details ground the reader in the scene', weight: 0.15 },
    { name: 'Emotional Arc', description: 'Character emotions evolve believably through the chapter', weight: 0.1 }
  ],

  beats: [
    { name: 'Specificity', description: 'Beats are concrete events, not vague descriptions', weight: 0.3 },
    { name: 'Coverage', description: 'Key moments from the synopsis are represented', weight: 0.25 },
    { name: 'Balance', description: 'Mix of action, dialogue, and emotional beats', weight: 0.2 },
    { name: 'Sequence', description: 'Beats are ordered logically and build tension', weight: 0.15 },
    { name: 'Checkability', description: 'Each beat can be verified as accomplished or not', weight: 0.1 }
  ],

  transition: [
    { name: 'Flow', description: 'The transition feels natural, not jarring', weight: 0.3 },
    { name: 'Continuity', description: 'Time, place, and character state are consistent', weight: 0.25 },
    { name: 'Hook', description: 'Reader is compelled to continue reading', weight: 0.2 },
    { name: 'Voice Preservation', description: 'Author style is maintained across the transition', weight: 0.15 },
    { name: 'Efficiency', description: 'Transition is economical, no unnecessary padding', weight: 0.1 }
  ],

  // Dimensions for evaluating prompt outputs (used by optimizePrompt)
  chapterGeneration: [
    { name: 'Word Count', description: 'Output meets the 2000-3000 word target', weight: 0.2 },
    { name: 'Scene Structure', description: 'Clear beginning, development, and ending', weight: 0.2 },
    { name: 'Show vs Tell', description: 'Uses sensory details and action, not exposition dumps', weight: 0.2 },
    { name: 'Dialogue Quality', description: 'Natural dialogue with subtext and character voice', weight: 0.15 },
    { name: 'Pacing', description: 'Appropriate rhythm, not rushed or draggy', weight: 0.15 },
    { name: 'Format Compliance', description: 'Follows all formatting requirements in the prompt', weight: 0.1 }
  ],

  terminologyGeneration: [
    { name: 'Uniqueness', description: 'Terms are specific to this world, not generic fantasy/sci-fi', weight: 0.25 },
    { name: 'Thematic Fit', description: 'Terms evoke the story tone and atmosphere', weight: 0.25 },
    { name: 'Definition Quality', description: 'Definitions are clear, evocative, and useful', weight: 0.2 },
    { name: 'Category Accuracy', description: 'Terms are correctly categorized', weight: 0.15 },
    { name: 'JSON Format', description: 'Output is valid JSON matching expected schema', weight: 0.15 }
  ],

  outlineGeneration: [
    { name: 'Arc Structure', description: 'Clear story arc with rising action and climax', weight: 0.25 },
    { name: 'Chapter Progression', description: 'Each chapter advances the plot meaningfully', weight: 0.2 },
    { name: 'Character Integration', description: 'Characters are woven into the plot naturally', weight: 0.2 },
    { name: 'Premise Alignment', description: 'Outline matches the given premise/genre', weight: 0.2 },
    { name: 'JSON Format', description: 'Output is valid JSON matching expected schema', weight: 0.15 }
  ]
} as const

export type { GepaConfig, GepaResult, GepaReflection, GepaDimension, GepaMutation, GepaTrace }
