import { describe, it, expect } from 'vitest';
import ExcelJS from 'exceljs';
import { ExcelBatchTestCaseParser } from '../../ai-agent-platform/packages/agent-core/src/parsers/ExcelBatchTestCaseParser';

/**
 * Helper to create an in-memory Excel workbook and return its buffer.
 */
async function buildExcelBuffer(
  rows: Record<string, string | number>[],
  headers: string[],
): Promise<Buffer> {
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet('Tests');

  // Header row
  sheet.addRow(headers);

  // Data rows
  for (const row of rows) {
    sheet.addRow(headers.map((h) => row[h] ?? ''));
  }

  const arrayBuffer = await workbook.xlsx.writeBuffer();
  return Buffer.from(arrayBuffer);
}

describe('ExcelBatchTestCaseParser', () => {
  const parser = new ExcelBatchTestCaseParser();

  describe('structured Excel with Action column', () => {
    it('parses rows into test cases and steps', async () => {
      const headers = ['Test Case ID', 'Test Case Name', 'Step No', 'Action', 'Target', 'Test Data', 'Expected Result'];
      const rows = [
        { 'Test Case ID': 'TC001', 'Test Case Name': 'Login test', 'Step No': 1, Action: 'enter', Target: 'Username field', 'Test Data': 'standard_user', 'Expected Result': '' },
        { 'Test Case ID': 'TC001', 'Test Case Name': 'Login test', 'Step No': 2, Action: 'enter', Target: 'Password field', 'Test Data': 'secret_sauce', 'Expected Result': '' },
        { 'Test Case ID': 'TC001', 'Test Case Name': 'Login test', 'Step No': 3, Action: 'click', Target: 'Login button', 'Test Data': '', 'Expected Result': 'Dashboard should be visible' },
      ];

      const buffer = await buildExcelBuffer(rows, headers);
      const { batch, preview } = await parser.parseBuffer(buffer, 'test.xlsx');

      expect(batch.testCases).toHaveLength(1);
      expect(batch.testCases[0].id).toBe('TC001');
      expect(batch.testCases[0].name).toBe('Login test');
      expect(batch.testCases[0].steps).toHaveLength(3);
      expect(batch.testCases[0].steps[0].action).toBe('enter');
      expect(batch.testCases[0].steps[0].target).toBe('Username field');
      expect(batch.testCases[0].steps[0].value).toBe('standard_user');
      expect(preview).toHaveLength(3);
      expect(preview[0].source).toBe('explicit-column');
      expect(preview[0].confidence).toBe(1.0);
    });

    it('normalises action synonyms', async () => {
      const headers = ['Test Case ID', 'Test Case Name', 'Step No', 'Action', 'Target'];
      const rows = [
        { 'Test Case ID': 'TC002', 'Test Case Name': 'Type test', 'Step No': 1, Action: 'type', Target: 'Email field' },
        { 'Test Case ID': 'TC002', 'Test Case Name': 'Type test', 'Step No': 2, Action: 'press', Target: 'Submit' },
        { 'Test Case ID': 'TC002', 'Test Case Name': 'Type test', 'Step No': 3, Action: 'validate', Target: 'Success message' },
      ];

      const buffer = await buildExcelBuffer(rows, headers);
      const { batch } = await parser.parseBuffer(buffer, 'test.xlsx');

      expect(batch.testCases[0].steps[0].action).toBe('enter');
      expect(batch.testCases[0].steps[1].action).toBe('click');
      expect(batch.testCases[0].steps[2].action).toBe('verifyVisible');
    });
  });

  describe('Excel without Action column (NLP fallback)', () => {
    it('infers actions from Target and Test Data using NLP', async () => {
      const headers = ['Test Case ID', 'Test Case Name', 'Step No', 'Target', 'Test Data', 'Expected Result'];
      const rows = [
        { 'Test Case ID': 'TC003', 'Test Case Name': 'NLP test', 'Step No': 1, Target: 'Click Login button', 'Test Data': '', 'Expected Result': '' },
        { 'Test Case ID': 'TC003', 'Test Case Name': 'NLP test', 'Step No': 2, Target: 'Verify dashboard is visible', 'Test Data': '', 'Expected Result': 'Dashboard shown' },
      ];

      const buffer = await buildExcelBuffer(rows, headers);
      const { batch, preview } = await parser.parseBuffer(buffer, 'test.xlsx');

      expect(batch.testCases).toHaveLength(1);
      expect(batch.testCases[0].steps[0].action).toBe('click');
      // Source should be nlp-rule since no Action column
      expect(preview[0].source).toBe('nlp-rule');
    });
  });

  describe('multiple test cases in one Excel', () => {
    it('groups rows by Test Case ID', async () => {
      const headers = ['Test Case ID', 'Test Case Name', 'Step No', 'Action', 'Target'];
      const rows = [
        { 'Test Case ID': 'TC001', 'Test Case Name': 'Login', 'Step No': 1, Action: 'click', Target: 'Login button' },
        { 'Test Case ID': 'TC002', 'Test Case Name': 'Logout', 'Step No': 1, Action: 'click', Target: 'Logout link' },
        { 'Test Case ID': 'TC002', 'Test Case Name': 'Logout', 'Step No': 2, Action: 'verify', Target: 'Login page' },
      ];

      const buffer = await buildExcelBuffer(rows, headers);
      const { batch } = await parser.parseBuffer(buffer, 'test.xlsx');

      expect(batch.testCases).toHaveLength(2);
      expect(batch.testCases[0].id).toBe('TC001');
      expect(batch.testCases[1].id).toBe('TC002');
      expect(batch.testCases[1].steps).toHaveLength(2);
    });

    it('sorts steps by Step No', async () => {
      const headers = ['Test Case ID', 'Test Case Name', 'Step No', 'Action', 'Target'];
      const rows = [
        { 'Test Case ID': 'TC001', 'Test Case Name': 'Order test', 'Step No': 3, Action: 'click', Target: 'Submit' },
        { 'Test Case ID': 'TC001', 'Test Case Name': 'Order test', 'Step No': 1, Action: 'enter', Target: 'Username field' },
        { 'Test Case ID': 'TC001', 'Test Case Name': 'Order test', 'Step No': 2, Action: 'enter', Target: 'Password field' },
      ];

      const buffer = await buildExcelBuffer(rows, headers);
      const { batch } = await parser.parseBuffer(buffer, 'test.xlsx');

      const steps = batch.testCases[0].steps;
      expect(steps[0].order).toBe(1);
      expect(steps[1].order).toBe(2);
      expect(steps[2].order).toBe(3);
    });
  });

  describe('preview rows', () => {
    it('returns preview rows with confidence and source', async () => {
      const headers = ['Test Case ID', 'Test Case Name', 'Step No', 'Action', 'Target', 'Test Data', 'Expected Result'];
      const rows = [
        { 'Test Case ID': 'TC001', 'Test Case Name': 'Test', 'Step No': 1, Action: 'click', Target: 'Submit', 'Test Data': '', 'Expected Result': 'Page loaded' },
      ];

      const buffer = await buildExcelBuffer(rows, headers);
      const { preview } = await parser.parseBuffer(buffer, 'mytest.xlsx');

      expect(preview).toHaveLength(1);
      expect(preview[0].testCaseId).toBe('TC001');
      expect(preview[0].stepNo).toBe(1);
      expect(preview[0].detectedAction).toBe('click');
      expect(preview[0].expected).toBe('Page loaded');
      expect(preview[0].confidence).toBe(1.0);
      expect(preview[0].source).toBe('explicit-column');
    });
  });

  describe('error handling', () => {
    it('throws when no worksheet found', async () => {
      const workbook = new ExcelJS.Workbook();
      const arrayBuffer = await workbook.xlsx.writeBuffer();
      const buffer = Buffer.from(arrayBuffer);
      await expect(parser.parseBuffer(buffer, 'empty.xlsx')).rejects.toThrow('No worksheet');
    });
  });
});
