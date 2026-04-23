import { CandidateBuilder } from '../CandidateBuilder';
import { ElementNode } from '../../domain';

const builder = new CandidateBuilder();

describe('CandidateBuilder', () => {
  it('generates css-testid candidate for data-testid element', () => {
    const el: ElementNode = {
      tag: 'button',
      attributes: { 'data-testid': 'login-btn' },
      framePath: [],
    };
    const candidates = builder.build(el);
    const first = candidates[0];
    expect(first.strategy).toBe('css-testid');
    expect(first.value).toContain('data-testid');
  });

  it('generates role candidate for button with aria role', () => {
    const el: ElementNode = {
      tag: 'button',
      role: 'button',
      ariaLabel: 'Login',
      attributes: {},
      framePath: [],
    };
    const candidates = builder.build(el);
    const roleCandidate = candidates.find(c => c.strategy === 'role');
    expect(roleCandidate).toBeDefined();
    expect(roleCandidate?.value).toContain('button');
  });

  it('generates label candidate for labeled input', () => {
    const el: ElementNode = {
      tag: 'input',
      label: 'Email',
      attributes: {},
      framePath: [],
    };
    const candidates = builder.build(el);
    const labelCandidate = candidates.find(c => c.strategy === 'label');
    expect(labelCandidate).toBeDefined();
    expect(labelCandidate?.value).toContain('Email');
  });

  it('generates css-id candidate for stable id', () => {
    const el: ElementNode = {
      tag: 'button',
      id: 'submit-btn',
      attributes: {},
      framePath: [],
    };
    const candidates = builder.build(el);
    const idCandidate = candidates.find(c => c.strategy === 'css-id');
    expect(idCandidate).toBeDefined();
    expect(idCandidate?.value).toBe('#submit-btn');
  });

  it('does NOT generate css-id candidate for UUID-like id', () => {
    const el: ElementNode = {
      tag: 'button',
      id: '123e4567-e89b-12d3-a456-426614174000',
      attributes: {},
      framePath: [],
    };
    const candidates = builder.build(el);
    const idCandidate = candidates.find(c => c.strategy === 'css-id');
    expect(idCandidate).toBeUndefined();
  });

  it('generates multiple candidates per element', () => {
    const el: ElementNode = {
      tag: 'button',
      id: 'login',
      role: 'button',
      text: 'Login',
      ariaLabel: 'Login',
      attributes: { 'data-testid': 'login-btn' },
      framePath: [],
    };
    const candidates = builder.build(el);
    expect(candidates.length).toBeGreaterThan(3);
  });
});
