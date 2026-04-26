import path from 'path';
import type { TestCase } from '../domain/TestCase.js';
import type { AiSupportService } from '../ai/AiSupportService.js';
import type { TestCaseParser } from './TestCaseParser.js';
import { TxtTestCaseParser } from './TxtTestCaseParser.js';
import { JsonTestCaseParser } from './JsonTestCaseParser.js';
import { GherkinTestCaseParser } from './GherkinTestCaseParser.js';

/**
 * Creates and applies the correct test case parser based on file extension.
 *
 * Supports three input formats:
 * - `.txt` — plain text test cases parsed by TxtTestCaseParser
 * - `.json` — structured JSON parsed by JsonTestCaseParser
 * - `.feature` — Gherkin BDD scenarios parsed by GherkinTestCaseParser
 *
 * When an AiSupportService is provided, low-confidence deterministic results are
 * supplemented with AI-assisted normalization and step intent classification.
 */
export class TestCaseParserFactory {
  /**
   * Creates a deterministic parser for the given file extension.
   *
   * Used for batch parsing (TestCaseSplitter) and simple single-file parsing.
   * Does not involve AI — the returned parser processes input deterministically.
   *
   * @param filePath - Path to the test case file; the extension determines the parser.
   * @returns The appropriate TestCaseParser implementation.
   * @throws Error if the file extension is not supported.
   */
  static create(filePath: string): TestCaseParser {
    const ext = path.extname(filePath).toLowerCase();
    switch (ext) {
      case '.txt': return new TxtTestCaseParser();
      case '.json': return new JsonTestCaseParser();
      case '.feature': return new GherkinTestCaseParser();
      default: throw new Error(`Unsupported test case file extension: ${ext}`);
    }
  }

  /**
   * Parses a test case file with optional AI-assisted fallback for ambiguous content.
   *
   * For JSON files, parsing is always deterministic. For TXT and feature files, the
   * deterministic parser runs first; if it produces a low-confidence result, the AI
   * support service is called to normalize the content or classify individual step intents.
   * If the AI call fails, the deterministic result is used as-is.
   *
   * @param filePath - Path to the test case file; determines parser and AI strategy.
   * @param content - Raw file content string.
   * @param aiSupport - AI support service instance (used for parsing assistance).
   * @returns Parsed and optionally AI-enhanced TestCase.
   */
  static async parseWithAiSupport(
    filePath: string,
    content: string,
    aiSupport: AiSupportService,
  ): Promise<TestCase> {
    const ext = path.extname(filePath).toLowerCase();
    if (ext === '.json') {
      return new JsonTestCaseParser().parse(content);
    }

    if (ext === '.txt') {
      const parser = new TxtTestCaseParser();
      return this.parseDetailedWithFallback(content, () => parser.parseDetailed(content), aiSupport);
    }

    if (ext === '.feature') {
      const parser = new GherkinTestCaseParser();
      return this.parseDetailedWithFallback(content, () => parser.parseDetailed(content), aiSupport);
    }

    return this.create(filePath).parse(content);
  }

  private static async parseDetailedWithFallback(
    content: string,
    deterministicParse: () => {
      testCase: TestCase;
      lowConfidenceSteps: Array<{ index: number; text: string }>;
      confidence: 'high' | 'low';
    },
    aiSupport: AiSupportService,
  ): Promise<TestCase> {
    try {
      return await this.resolveWithFallback(content, deterministicParse(), aiSupport);
    } catch (error) {
      const normalizedJson = await aiSupport.normalizeTestCase(content);
      if (normalizedJson) {
        return new JsonTestCaseParser().parse(normalizedJson);
      }
      throw error;
    }
  }

  private static async resolveWithFallback(
    content: string,
    deterministic: {
      testCase: TestCase;
      lowConfidenceSteps: Array<{ index: number; text: string }>;
      confidence: 'high' | 'low';
    },
    aiSupport: AiSupportService,
  ): Promise<TestCase> {
    if (deterministic.confidence === 'low') {
      const normalizedJson = await aiSupport.normalizeTestCase(content);
      if (normalizedJson) {
        return new JsonTestCaseParser().parse(normalizedJson);
      }
    }

    const patchedSteps = [...deterministic.testCase.steps];
    for (const lowConfidence of deterministic.lowConfidenceSteps) {
      const classified = await aiSupport.classifyStepIntent(lowConfidence.text);
      if (!classified) continue;
      patchedSteps[lowConfidence.index] = {
        ...patchedSteps[lowConfidence.index],
        action: classified.action,
        target: classified.target,
        value: classified.value,
      };
    }

    return {
      ...deterministic.testCase,
      steps: patchedSteps,
    };
  }
}
