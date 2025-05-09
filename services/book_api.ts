// src/services/book_api.ts
// This is the actual module that would make the HTTP request.
// For testing, this entire module (or specific exports) will be mocked.

export interface ApiBookItem {
  title: string;
  link: string;
  image: string;
  author: string;
  discount: string; // In API but might not be in our Book model
  publisher: string;
  pubdate: string;
  isbn: string;
  description: string;
}

export interface ApiBookResponse {
  lastBuildDate: string;
  total: number;
  start: number;
  display: number;
  items: ApiBookItem[];
}

export async function searchBooksExternal(
  query: string
): Promise<ApiBookResponse> {
  // In a real application, you would use fetch or axios here to call:
  // `https://book-server-roan.vercel.app/books/${encodeURIComponent(query)}`

  // This placeholder is here just so the module has an export.
  // It will be mocked in tests, so this actual implementation won't run during tests.
  console.warn(
    `[REAL API CALL - SHOULD BE MOCKED IN TESTS] Called searchBooksExternal for: ${query}`
  );
  // To prevent accidental real calls during unmocked scenarios or setup issues:
  throw new Error(
    "searchBooksExternal was called without being properly mocked in a test environment!"
  );
}
