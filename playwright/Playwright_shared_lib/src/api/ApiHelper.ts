import { APIRequestContext } from "@playwright/test";

export interface ApiResponse<T = unknown> {
  status: number;
  data: T;
  headers: Record<string, string>;
  duration: number;
}

/**
 * ApiHelper: Reusable API request utility.
 * Wraps Playwright's APIRequestContext with logging, timing, and error handling.
 */
export class ApiHelper {
  constructor(
    private request: APIRequestContext,
    private baseUrl: string = "",
  ) {}

  /** GET request */
  async get<T = unknown>(
    endpoint: string,
    headers?: Record<string, string>,
  ): Promise<ApiResponse<T>> {
    const start = Date.now();
    const response = await this.request.get(`${this.baseUrl}${endpoint}`, { headers });
    const duration = Date.now() - start;

    const data = (await response.json()) as T;
    console.log(`[API] GET ${endpoint} → ${response.status()} (${duration}ms)`);

    return {
      status: response.status(),
      data,
      headers: Object.fromEntries(Object.entries(response.headers())),
      duration,
    };
  }

  /** POST request */
  async post<T = unknown>(
    endpoint: string,
    body: Record<string, unknown>,
    headers?: Record<string, string>,
  ): Promise<ApiResponse<T>> {
    const start = Date.now();
    const response = await this.request.post(`${this.baseUrl}${endpoint}`, {
      data: body,
      headers,
    });
    const duration = Date.now() - start;

    const data = (await response.json()) as T;
    console.log(`[API] POST ${endpoint} → ${response.status()} (${duration}ms)`);

    return {
      status: response.status(),
      data,
      headers: Object.fromEntries(Object.entries(response.headers())),
      duration,
    };
  }

  /** PUT request */
  async put<T = unknown>(
    endpoint: string,
    body: Record<string, unknown>,
    headers?: Record<string, string>,
  ): Promise<ApiResponse<T>> {
    const start = Date.now();
    const response = await this.request.put(`${this.baseUrl}${endpoint}`, {
      data: body,
      headers,
    });
    const duration = Date.now() - start;

    const data = (await response.json()) as T;
    console.log(`[API] PUT ${endpoint} → ${response.status()} (${duration}ms)`);

    return {
      status: response.status(),
      data,
      headers: Object.fromEntries(Object.entries(response.headers())),
      duration,
    };
  }

  /** DELETE request */
  async delete<T = unknown>(
    endpoint: string,
    headers?: Record<string, string>,
  ): Promise<ApiResponse<T>> {
    const start = Date.now();
    const response = await this.request.delete(`${this.baseUrl}${endpoint}`, { headers });
    const duration = Date.now() - start;

    let data = {} as T;
    try {
      data = (await response.json()) as T;
    } catch {
      // DELETE may return empty body
    }
    console.log(`[API] DELETE ${endpoint} → ${response.status()} (${duration}ms)`);

    return {
      status: response.status(),
      data,
      headers: Object.fromEntries(Object.entries(response.headers())),
      duration,
    };
  }
}
