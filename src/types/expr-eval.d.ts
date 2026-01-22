declare module 'expr-eval' {
  export class Parser {
    parse(expression: string): Expression;
  }

  export interface Expression {
    evaluate(variables?: Record<string, number>): number;
    substitute(variable: string, expr: Expression | string | number): Expression;
    simplify(variables?: Record<string, number>): Expression;
    toString(): string;
    variables(): string[];
  }
}
