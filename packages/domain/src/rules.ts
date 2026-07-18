import type { OrganizationType, SearchRequest } from '@pwsm/contracts';

/**
 * 候補抽出ルール評価（詳細設計仕様書 §5.2 stakeholder_rules / §7.1）。
 * condition_json は JSON Logic 相当の宣言的条件のうち、説明可能な最小サブセットのみ対応する。
 * ルールは「候補を提示する」ためのものであり、所管や許認可を断定しない。
 */

/** 検索入力のうちルール評価が参照できる配列フィールド */
export type RuleArrayField = 'workTypes' | 'assetTypes' | 'impactTypes';

/** フィールドと値の対応を保った includes 条件（未知の文字列をコンパイル時に拒否する） */
type IncludesCondition = {
  [Field in RuleArrayField]: {
    readonly includes: {
      readonly field: Field;
      readonly value: SearchRequest[Field][number];
    };
  };
}[RuleArrayField];

/** フィールドと値の対応を保った intersects 条件 */
type IntersectsCondition = {
  [Field in RuleArrayField]: {
    readonly intersects: {
      readonly field: Field;
      readonly values: readonly SearchRequest[Field][number][];
    };
  };
}[RuleArrayField];

export type RuleCondition =
  | { readonly all: readonly RuleCondition[] }
  | { readonly any: readonly RuleCondition[] }
  | { readonly not: RuleCondition }
  | IncludesCondition
  | IntersectsCondition
  | { readonly purposeIs: NonNullable<SearchRequest['purpose']> }
  | { readonly always: true };

export interface StakeholderRule {
  ruleCode: string;
  version: number;
  condition: RuleCondition;
  /** このルールが提示を促す機関種別 */
  targetTypes: readonly OrganizationType[];
  /** 画面へ表示する一致理由テンプレート */
  reasonTemplate: string;
  priority: number;
}

export interface RuleMatch {
  ruleCode: string;
  ruleVersion: number;
  targetTypes: readonly OrganizationType[];
  reason: string;
  priority: number;
}

type RuleInput = Pick<SearchRequest, 'workTypes' | 'assetTypes' | 'impactTypes' | 'purpose'>;

/** 条件を再帰評価する。未知の条件形式は false（安全側 = 候補を増やさない断定をしない）。 */
export function evaluateCondition(condition: RuleCondition, input: RuleInput): boolean {
  if ('all' in condition) {
    return condition.all.length > 0 && condition.all.every((c) => evaluateCondition(c, input));
  }
  if ('any' in condition) {
    return condition.any.some((c) => evaluateCondition(c, input));
  }
  if ('not' in condition) {
    return !evaluateCondition(condition.not, input);
  }
  if ('includes' in condition) {
    const values: readonly string[] = input[condition.includes.field];
    return values.includes(condition.includes.value);
  }
  if ('intersects' in condition) {
    const values: readonly string[] = input[condition.intersects.field];
    return condition.intersects.values.some((v) => values.includes(v));
  }
  if ('purposeIs' in condition) {
    return input.purpose === condition.purposeIs;
  }
  if ('always' in condition) {
    return true;
  }
  return false;
}

/** 有効なルール集合を優先度順に評価し、一致したルールを返す。 */
export function evaluateRules(
  input: RuleInput,
  rules: readonly StakeholderRule[],
): RuleMatch[] {
  return [...rules]
    .sort((a, b) => a.priority - b.priority)
    .filter((rule) => evaluateCondition(rule.condition, input))
    .map((rule) => ({
      ruleCode: rule.ruleCode,
      ruleVersion: rule.version,
      targetTypes: rule.targetTypes,
      reason: rule.reasonTemplate,
      priority: rule.priority,
    }));
}
