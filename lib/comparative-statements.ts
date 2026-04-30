import { Prisma } from "@/generated/prisma";

export type ComparativeScoreLineInput = {
  id: number;
  financialGrandTotal: Prisma.Decimal;
  technicalScore: Prisma.Decimal;
  isResponsive: boolean;
};

export type ComparativeScoreLineResult = ComparativeScoreLineInput & {
  financialScore: Prisma.Decimal;
  combinedScore: Prisma.Decimal;
  rank: number | null;
};

function toDecimal(value: number | Prisma.Decimal) {
  return value instanceof Prisma.Decimal ? value : new Prisma.Decimal(value);
}

function normalizeMoney(value: Prisma.Decimal) {
  return value.toDecimalPlaces(2, Prisma.Decimal.ROUND_HALF_UP);
}

function normalizeScore(value: Prisma.Decimal) {
  if (value.lt(0)) return new Prisma.Decimal(0);
  if (value.gt(100)) return new Prisma.Decimal(100);
  return value.toDecimalPlaces(2, Prisma.Decimal.ROUND_HALF_UP);
}

export function normalizeWeightInput(raw: unknown, field: string) {
  if (raw === undefined || raw === null || raw === "") return null;
  const value = Number(raw);
  if (!Number.isFinite(value) || value < 0 || value > 100) {
    throw new Error(`${field} must be between 0 and 100.`);
  }
  return toDecimal(value).toDecimalPlaces(2, Prisma.Decimal.ROUND_HALF_UP);
}

export function resolveWeightPair(input: {
  technicalWeight: Prisma.Decimal | null;
  financialWeight: Prisma.Decimal | null;
}) {
  const technical = input.technicalWeight;
  const financial = input.financialWeight;

  if (!technical && !financial) {
    return {
      technicalWeight: new Prisma.Decimal(70),
      financialWeight: new Prisma.Decimal(30),
    };
  }
  if (technical && !financial) {
    return {
      technicalWeight: technical,
      financialWeight: new Prisma.Decimal(100).minus(technical),
    };
  }
  if (!technical && financial) {
    return {
      technicalWeight: new Prisma.Decimal(100).minus(financial),
      financialWeight: financial,
    };
  }

  const total = technical!.plus(financial!);
  if (!total.equals(new Prisma.Decimal(100))) {
    throw new Error("Technical and financial weights must sum to 100.");
  }
  return {
    technicalWeight: technical!,
    financialWeight: financial!,
  };
}

export function computeComparativeScores(
  lines: ComparativeScoreLineInput[],
  technicalWeight: Prisma.Decimal,
  financialWeight: Prisma.Decimal,
): ComparativeScoreLineResult[] {
  const responsive = lines.filter((line) => line.isResponsive);
  const positiveTotals = responsive
    .map((line) => line.financialGrandTotal)
    .filter((value) => value.gt(0));
  const lowestTotal = positiveTotals.reduce<Prisma.Decimal | null>((current, next) => {
    if (!current) return next;
    return next.lt(current) ? next : current;
  }, null);

  const withScores: ComparativeScoreLineResult[] = lines.map((line) => {
    const technicalScore = normalizeScore(line.technicalScore);
    const financialScore =
      line.isResponsive && lowestTotal && line.financialGrandTotal.gt(0)
        ? normalizeScore(lowestTotal.div(line.financialGrandTotal).mul(100))
        : new Prisma.Decimal(0);
    const combinedScore = line.isResponsive
      ? technicalScore
          .mul(technicalWeight)
          .plus(financialScore.mul(financialWeight))
          .div(100)
          .toDecimalPlaces(4, Prisma.Decimal.ROUND_HALF_UP)
      : new Prisma.Decimal(0);

    return {
      ...line,
      technicalScore,
      financialScore,
      combinedScore,
      rank: null,
    };
  });

  const ranked = [...withScores]
    .filter((line) => line.isResponsive)
    .sort((left, right) => {
      if (!left.combinedScore.equals(right.combinedScore)) {
        return right.combinedScore.comparedTo(left.combinedScore);
      }
      if (!left.financialGrandTotal.equals(right.financialGrandTotal)) {
        return left.financialGrandTotal.comparedTo(right.financialGrandTotal);
      }
      return left.id - right.id;
    });

  ranked.forEach((line, index) => {
    const target = withScores.find((item) => item.id === line.id);
    if (target) target.rank = index + 1;
  });

  return withScores.map((line) => ({
    ...line,
    financialGrandTotal: normalizeMoney(line.financialGrandTotal),
  }));
}

