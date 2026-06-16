import type { HandlerEvent, HandlerResponse } from '@netlify/functions';
import type { SupabaseClient } from '@supabase/supabase-js';

interface QueryResult<T = unknown> {
  data: T;
  error: { message: string } | null;
}

export interface QueryState {
  table: string;
  operation: 'select' | 'insert' | 'update' | 'delete';
  filters: Record<string, unknown>;
  payload?: unknown;
}

type QueryResolver = (state: QueryState) => QueryResult;

class FakeQueryBuilder implements PromiseLike<QueryResult> {
  private readonly state: QueryState;

  constructor(table: string, private readonly resolver: QueryResolver) {
    this.state = {
      table,
      operation: 'select',
      filters: {},
    };
  }

  select(): this {
    this.state.operation = this.state.operation === 'select' ? 'select' : this.state.operation;
    return this;
  }

  eq(column: string, value: unknown): this {
    this.state.filters[column] = value;
    return this;
  }

  is(column: string, value: unknown): this {
    this.state.filters[column] = value;
    return this;
  }

  order(): this {
    return this;
  }

  insert(payload: unknown): this {
    this.state.operation = 'insert';
    this.state.payload = payload;
    return this;
  }

  update(payload: unknown): this {
    this.state.operation = 'update';
    this.state.payload = payload;
    return this;
  }

  delete(): this {
    this.state.operation = 'delete';
    return this;
  }

  single<T = unknown>(): Promise<QueryResult<T>> {
    return Promise.resolve(this.resolver(this.state) as QueryResult<T>);
  }

  maybeSingle<T = unknown>(): Promise<QueryResult<T | null>> {
    return Promise.resolve(this.resolver(this.state) as QueryResult<T | null>);
  }

  then<TResult1 = QueryResult, TResult2 = never>(
    onfulfilled?: ((value: QueryResult) => TResult1 | PromiseLike<TResult1>) | null,
    onrejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null
  ): Promise<TResult1 | TResult2> {
    return Promise.resolve(this.resolver(this.state)).then(onfulfilled, onrejected);
  }
}

export const createFakeSupabaseClient = (
  resolver: QueryResolver,
  rpcResolver: (name: string, args: Record<string, unknown>) => QueryResult = () => ({
    data: null,
    error: null,
  })
): SupabaseClient => ({
  from: (table: string) => new FakeQueryBuilder(table, resolver),
  rpc: (name: string, args: Record<string, unknown>) => Promise.resolve(rpcResolver(name, args)),
} as unknown as SupabaseClient);

export const event = (
  method: string,
  path: string,
  headers: Record<string, string> = {},
  body: string | null = null,
  queryStringParameters: Record<string, string> | null = null
): HandlerEvent => ({
  httpMethod: method,
  path,
  headers,
  body,
  queryStringParameters,
} as unknown as HandlerEvent);

export const expectHandlerResponse = (response: void | HandlerResponse): HandlerResponse => {
  if (!response) {
    throw new Error('Expected handler response');
  }

  return response;
};

export const parseJsonResponse = <T = unknown>(response: HandlerResponse): T => {
  if (typeof response.body !== 'string') {
    throw new Error('Expected JSON response body');
  }

  return JSON.parse(response.body) as T;
};
