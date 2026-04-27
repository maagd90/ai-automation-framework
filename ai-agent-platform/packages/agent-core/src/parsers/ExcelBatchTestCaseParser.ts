import ExcelJS from 'exceljs';
import type { TestCaseBatch, TestCase, TestStep } from '@ai-agent/shared-types';
import { StepNlpAnalyzer, normalizeActionColumn } from '../nlp/StepNlpAnalyzer';

/**
 * Supported column names (case-insensitive).
 */
const COL_TEST_CASE_ID = /^test\s*case\s*id$/i;
const COL_TEST_CASE_NAME = /^test\s*case\s*name$/i;
const COL_STEP_NO = /^step\s*no\.?$/i;
const COL_ACTION = /^action$/i;
const COL_TARGET = /^target$/i;
const COL_TEST_DATA = /^test\s*data$/i;
const COL_EXPECTED_RESULT = /^expected\s*result$/i;
const COL_PRIORITY = /^priority$/i;
const COL_MODULE = /^module$/i;
const COL_FEATURE = /^feature$/i;

interface ColumnMap {
  testCaseId?: number;
  testCaseName?: number;
  stepNo?: number;
  action?: number;
  target?: number;
  testData?: number;
  expectedResult?: number;
  priority?: number;
  module?: number;
  feature?: number;
}

interface RawRow {
  testCaseId: string;
  testCaseName: string;
  stepNo: number;
  action: string;
  target: string;
  testData: string;
  expectedResult: string;
}

export interface ExcelPreviewRow {
  testCaseId: string;
  testCaseName: string;
  stepNo: number;
  originalStep: string;
  detectedAction: string;
  target: string;
  value: string;
  expected: string;
  confidence: number;
  source: 'explicit-column' | 'nlp-rule' | 'ai-fallback';
}

export class ExcelBatchTestCaseParser {
  private readonly nlp = new StepNlpAnalyzer();

  /**
   * Parse an Excel file buffer into a TestCaseBatch.
   * Also returns preview rows for the preview endpoint.
   */
  async parseBuffer(
    buffer: Buffer | ArrayBuffer,
    filename: string,
  ): Promise<{ batch: TestCaseBatch; preview: ExcelPreviewRow[] }> {
    const workbook = new ExcelJS.Workbook();
    // Copy into a fresh ArrayBuffer to avoid SharedArrayBuffer incompatibilities
    let ab: ArrayBuffer;
    if (buffer instanceof ArrayBuffer) {
      ab = buffer;
    } else {
      ab = buffer.buffer.slice(
        buffer.byteOffset,
        buffer.byteOffset + buffer.byteLength,
      ) as ArrayBuffer;
    }
    await workbook.xlsx.load(ab);

    const worksheet = workbook.worksheets[0];
    if (!worksheet) {
      throw new Error(`No worksheet found in "${filename}"`);
    }

    const colMap = this.buildColumnMap(worksheet);
    const rawRows = this.extractRows(worksheet, colMap);

    if (rawRows.length === 0) {
      throw new Error(`No data rows found in "${filename}"`);
    }

    const preview: ExcelPreviewRow[] = [];
    const caseMap = new Map<string, { name: string; steps: TestStep[]; expectedResults: string[] }>();

    for (const row of rawRows) {
      const caseId = row.testCaseId || `TC-${caseMap.size + 1}`;
      if (!caseMap.has(caseId)) {
        caseMap.set(caseId, {
          name: row.testCaseName || caseId,
          steps: [],
          expectedResults: [],
        });
      }
      const tc = caseMap.get(caseId)!;

      // ── Determine action ─────────────────────────────────────────────────
      let action: string;
      let target: string;
      let value: string | undefined;
      let expected: string | undefined;
      let confidence: number;
      let source: ExcelPreviewRow['source'];

      const originalStep = [row.action, row.target, row.testData]
        .filter(Boolean)
        .join(' ');

      if (row.action) {
        // Action column present — normalise it
        const normalised = normalizeActionColumn(row.action);
        action = normalised ?? row.action.toLowerCase().trim();
        target = row.target || '';
        value = row.testData || undefined;
        expected = row.expectedResult || undefined;
        confidence = 1.0;
        source = 'explicit-column';
      } else {
        // No action column — use NLP
        const nlpText = [row.target, row.testData].filter(Boolean).join(' ') || originalStep;
        const nlpResult = this.nlp.analyze(nlpText);
        action = nlpResult.action;
        target = nlpResult.target || row.target;
        value = nlpResult.value ?? (row.testData || undefined);
        expected = nlpResult.expected ?? (row.expectedResult || undefined);
        confidence = nlpResult.confidence;
        source = nlpResult.source;
      }

      const stepOrder = row.stepNo || tc.steps.length + 1;

      tc.steps.push({
        order: stepOrder,
        action,
        target: target || undefined,
        value,
      });

      if (row.expectedResult) {
        tc.expectedResults.push(row.expectedResult);
      }

      preview.push({
        testCaseId: caseId,
        testCaseName: row.testCaseName || caseId,
        stepNo: stepOrder,
        originalStep,
        detectedAction: action,
        target: target || '',
        value: value || '',
        expected: expected || row.expectedResult || '',
        confidence,
        source,
      });
    }

    const testCases: TestCase[] = Array.from(caseMap.entries()).map(([id, tc]) => ({
      id,
      name: tc.name,
      steps: tc.steps.sort((a, b) => a.order - b.order),
      expectedResults: tc.expectedResults,
    }));

    const batch: TestCaseBatch = {
      batchName: filename,
      testCases,
    };

    return { batch, preview };
  }

  private buildColumnMap(worksheet: ExcelJS.Worksheet): ColumnMap {
    const colMap: ColumnMap = {};
    const headerRow = worksheet.getRow(1);

    headerRow.eachCell((cell, colNumber) => {
      const header = String(cell.value ?? '').trim();
      if (COL_TEST_CASE_ID.test(header)) colMap.testCaseId = colNumber;
      else if (COL_TEST_CASE_NAME.test(header)) colMap.testCaseName = colNumber;
      else if (COL_STEP_NO.test(header)) colMap.stepNo = colNumber;
      else if (COL_ACTION.test(header)) colMap.action = colNumber;
      else if (COL_TARGET.test(header)) colMap.target = colNumber;
      else if (COL_TEST_DATA.test(header)) colMap.testData = colNumber;
      else if (COL_EXPECTED_RESULT.test(header)) colMap.expectedResult = colNumber;
      else if (COL_PRIORITY.test(header)) colMap.priority = colNumber;
      else if (COL_MODULE.test(header)) colMap.module = colNumber;
      else if (COL_FEATURE.test(header)) colMap.feature = colNumber;
    });

    return colMap;
  }

  private extractRows(worksheet: ExcelJS.Worksheet, colMap: ColumnMap): RawRow[] {
    const rows: RawRow[] = [];

    worksheet.eachRow((row, rowNumber) => {
      if (rowNumber === 1) return; // Skip header

      const getCellValue = (colNumber: number | undefined): string => {
        if (!colNumber) return '';
        const cell = row.getCell(colNumber);
        const raw = cell.value;
        if (raw === null || raw === undefined) return '';
        if (typeof raw === 'object' && 'text' in raw) return String((raw as { text: string }).text);
        if (typeof raw === 'object' && 'richText' in raw) {
          return (raw as { richText: Array<{ text: string }> }).richText
            .map((r) => r.text)
            .join('');
        }
        return String(raw).trim();
      };

      const testCaseId = getCellValue(colMap.testCaseId);
      const testCaseName = getCellValue(colMap.testCaseName);
      const stepNoRaw = getCellValue(colMap.stepNo);
      const action = getCellValue(colMap.action);
      const target = getCellValue(colMap.target);
      const testData = getCellValue(colMap.testData);
      const expectedResult = getCellValue(colMap.expectedResult);

      // Skip fully empty rows
      if (!testCaseId && !testCaseName && !target && !action && !testData) return;

      const stepNo = parseInt(stepNoRaw, 10);

      rows.push({
        testCaseId,
        testCaseName,
        stepNo: isNaN(stepNo) ? 0 : stepNo,
        action,
        target,
        testData,
        expectedResult,
      });
    });

    return rows;
  }
}
