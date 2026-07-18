import { describe, expect, it } from 'vitest';
import {
  evaluateCondition,
  evaluateRules,
  type RuleCondition,
  type StakeholderRule,
} from '../src/rules.js';

const input = {
  workTypes: ['excavation', 'traffic_restriction'],
  assetTypes: ['road'],
  impactTypes: [],
  purpose: 'pre_consultation',
} as const;

describe('evaluateCondition', () => {
  it('includes: 配列フィールドに値が含まれるか', () => {
    expect(evaluateCondition({ includes: { field: 'workTypes', value: 'excavation' } }, input)).toBe(true);
    expect(evaluateCondition({ includes: { field: 'impactTypes', value: 'night_work' } }, input)).toBe(false);
  });

  it('intersects: いずれかの値が含まれるか', () => {
    expect(
      evaluateCondition(
        { intersects: { field: 'workTypes', values: ['occupation', 'traffic_restriction'] } },
        input,
      ),
    ).toBe(true);
    expect(
      evaluateCondition({ intersects: { field: 'workTypes', values: ['drainage'] } }, input),
    ).toBe(false);
  });

  it('all / any / not の複合条件', () => {
    const cond: RuleCondition = {
      all: [
        { includes: { field: 'assetTypes', value: 'road' } },
        { any: [{ purposeIs: 'pre_consultation' }, { purposeIs: 'pre_bid' }] },
        { not: { includes: { field: 'impactTypes', value: 'water_area_use' } } },
      ],
    };
    expect(evaluateCondition(cond, input)).toBe(true);
  });

  it('空の all は false（無条件一致を防ぐ）', () => {
    expect(evaluateCondition({ all: [] }, input)).toBe(false);
  });

  it('always: true は常に一致', () => {
    expect(evaluateCondition({ always: true }, input)).toBe(true);
  });

  it('未知の条件形式は false（安全側）', () => {
    expect(evaluateCondition({} as RuleCondition, input)).toBe(false);
  });
});

describe('evaluateRules', () => {
  const rules: StakeholderRule[] = [
    {
      ruleCode: 'R-ROAD-EXCAVATION',
      version: 1,
      condition: {
        all: [
          { includes: { field: 'assetTypes', value: 'road' } },
          { includes: { field: 'workTypes', value: 'excavation' } },
        ],
      },
      targetTypes: ['road_admin'],
      reasonTemplate: '道路での掘削作業が選択されています',
      priority: 10,
    },
    {
      ruleCode: 'R-TRAFFIC-POLICE',
      version: 1,
      condition: {
        intersects: { field: 'workTypes', values: ['traffic_restriction', 'lane_restriction'] },
      },
      targetTypes: ['police'],
      reasonTemplate: '通行規制を伴う作業が選択されています',
      priority: 20,
    },
    {
      ruleCode: 'R-RIVER',
      version: 1,
      condition: { includes: { field: 'assetTypes', value: 'river' } },
      targetTypes: ['river_admin'],
      reasonTemplate: '河川区域が対象に含まれています',
      priority: 15,
    },
  ];

  it('一致したルールのみ優先度順に返す', () => {
    const matches = evaluateRules(input, rules);
    expect(matches.map((m) => m.ruleCode)).toEqual(['R-ROAD-EXCAVATION', 'R-TRAFFIC-POLICE']);
  });

  it('一致理由テンプレートを保持する', () => {
    const matches = evaluateRules(input, rules);
    expect(matches[0]?.reason).toBe('道路での掘削作業が選択されています');
  });

  it('条件が満たされない場合は空配列', () => {
    const matches = evaluateRules(
      { workTypes: [], assetTypes: [], impactTypes: [], purpose: undefined },
      rules,
    );
    expect(matches).toEqual([]);
  });
});
