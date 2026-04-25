import path from 'path';
import type { TestCase } from '../domain/TestCase.js';
import type { AiSupportService } from '../ai/AiSupportService.js';
import type { TestCaseParser } from './TestCaseParser.js';
import { TxtTestCaseParser } from './TxtTestCaseParser.js';
import { JsonTestCaseParser } from './JsonTestCaseParser.js';
import { GherkinTestCaseParser } from './GherkinTestCaseParser.js';

export class TestCaseParserFactory {
  static create(filePath: string): TestCaseParser {
    const ext = path.extname(filePath).toLowerCase();
    switch (ext) {
      case '.txt': return new TxtTestCaseParser();
      case '.json': return new JsonTestCaseParser();
      case '.feature': return new GherkinTestCaseParser();
      default: throw new Error(`Unsupported test case file extension: ${ext}`);
    }
  }

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
