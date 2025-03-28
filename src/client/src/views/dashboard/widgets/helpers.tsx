import {
  differenceInDays,
  differenceInHours,
  subDays,
  subHours,
} from 'date-fns';
import { groupBy } from 'lodash';
import { GetForwardsQuery } from '../../../graphql/queries/__generated__/getForwards.generated';
import { defaultGrid } from '../../../utils/gridConstants';
import { StoredWidget } from '..';
import { widgetList, WidgetProps } from './widgetList';
import { GetInvoicesQuery } from '../../../graphql/queries/__generated__/getInvoices.generated';
import { GetPaymentsQuery } from '../../../graphql/queries/__generated__/getPayments.generated';

const removeTime = (date: Date) => {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
};

const getColumns = (width: number): number => {
  const { lg, md, sm, xs } = defaultGrid.breakpoints;

  if (width >= lg) {
    return defaultGrid.columns.lg;
  }
  if (width >= md) {
    return defaultGrid.columns.md;
  }
  if (width >= sm) {
    return defaultGrid.columns.sm;
  }
  if (width >= xs) {
    return defaultGrid.columns.xs;
  }
  return defaultGrid.columns.xxs;
};

export type EnrichedWidgetProps = {
  nodeId?: string;
  nodeAlias?: string;
  color?: string;
} & WidgetProps;

export const getWidgets = (
  widgets: StoredWidget[],
  width: number,
  extra: StoredWidget[]
): EnrichedWidgetProps[] => {
  if (!widgets?.length) return [];

  const columns = getColumns(width);

  const normalized = [...widgets, ...extra].reduce((p, c, index) => {
    const current = widgetList.find(w => w.id === c.id);

    if (!current) {
      return p;
    }

    return [
      ...p,
      {
        ...current,
        default: {
          ...current.default,
          x: (current.default.w * index) % columns,
        },
      },
    ];
  }, [] as EnrichedWidgetProps[]);

  return normalized;
};

type ArrayType =
  | GetForwardsQuery['getForwards']
  | GetInvoicesQuery['getInvoices']['invoices']
  | GetPaymentsQuery['getPayments']['payments'];

export const getByTime = (array: ArrayType, time: number): any[] => {
  if (!array?.length) return [];

  const transactions: {
    difference: number;
    date: string;
    tokens: number;
    fee?: number;
  }[] = [];

  const isDay = time <= 1;

  const today = new Date();

  array.forEach((transaction: ArrayType[0]) => {
    if (!transaction?.__typename) return;

    if (transaction.__typename === 'InvoiceType') {
      if (!transaction.is_confirmed || !transaction.confirmed_at) return;

      const difference = isDay
        ? 24 - differenceInHours(today, new Date(transaction.confirmed_at))
        : time -
          differenceInDays(
            today,
            removeTime(new Date(transaction.confirmed_at))
          );

      transactions.push({
        difference,
        date: new Date(transaction.confirmed_at).toISOString(),
        tokens: Number(transaction.tokens),
      });
    } else if (transaction.__typename === 'PaymentType') {
      if (!transaction.is_confirmed) return;

      const difference = isDay
        ? 24 - differenceInHours(today, new Date(transaction.created_at))
        : time -
          differenceInDays(today, removeTime(new Date(transaction.created_at)));

      transactions.push({
        difference,
        date: new Date(transaction.created_at).toISOString(),
        tokens: Number(transaction.tokens),
      });
    } else if (transaction.__typename === 'Forward') {
      const difference = isDay
        ? 24 - differenceInHours(today, new Date(transaction.created_at))
        : time -
          differenceInDays(today, removeTime(new Date(transaction.created_at)));

      transactions.push({
        difference,
        date: transaction.created_at,
        tokens: Number(transaction.tokens),
        fee: Number(transaction.fee),
      });
    }
  });

  if (!transactions?.length) return [];

  const grouped = groupBy(transactions, 'difference');

  const final: any[] = [];
  const differences = Array.from(
    { length: isDay ? 25 : time + 1 },
    (_, i) => i
  );

  differences.forEach(key => {
    const group = grouped[key];
    if (!group) {
      final.push({
        tokens: 0,
        amount: 0,
        fee: 0,
        date: isDay
          ? subHours(today, 24 - Number(key))
              .toISOString()
              .slice(0, 13)
          : subDays(today, time - Number(key))
              .toISOString()
              .slice(0, 10),
      });
      return;
    }

    const reduced = group.reduce(
      (total, transaction) => {
        return {
          tokens: total.tokens + transaction.tokens,
          fee: total.fee + (transaction.fee || 0),
          amount: total.amount + 1,
          date: total.date
            ? total.date
            : isDay
            ? subHours(today, 24 - Number(key))
                .toISOString()
                .slice(0, 13)
            : subDays(today, time - Number(key))
                .toISOString()
                .slice(0, 10),
        };
      },
      {
        tokens: 0,
        fee: 0,
        amount: 0,
        date: '',
      }
    );

    final.push(reduced);
  });

  return final;
};
