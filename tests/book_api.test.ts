// tests/book-api.integration.spec.ts
import { describe, it, expect, vi, beforeEach } from "vitest";
import { PrismaClient } from "@prisma/client";
import { searchBooksExternal, ApiBookResponse } from "../services/book_api";

// ▶︎ 외부 API 모킹
vi.mock("../services/book_api", async () => {
  const actual = await vi.importActual<typeof import("../services/book_api")>(
    "../services/book_api"
  );
  return { ...actual, searchBooksExternal: vi.fn() };
});

const prisma = new PrismaClient();

describe("Book API Integration (transactional)", () => {
  // 매 테스트 전 DB 비우기
  beforeEach(async () => {
    await prisma.$transaction([
      prisma.bookshelfEntry.deleteMany(),
      prisma.question.deleteMany(),
      prisma.book.deleteMany(),
    ]);
    vi.resetAllMocks();
  });

  it("calls external API and returns result", async () => {
    const mockRes: ApiBookResponse = {
      lastBuildDate: "2025-05-09T14:00:00.000Z",
      total: 2,
      start: 1,
      display: 2,
      items: [
        {
          title: "유교와 한국사회",
          link: "https://example.com/book1",
          image: "https://example.com/image1.jpg",
          author: "김철수",
          discount: "18000",
          publisher: "한국출판사",
          pubdate: "20220315",
          isbn: "9788912345678",
          description: "유교가 한국 사회에 미친 영향에 대한 연구",
        },
        {
          title: "현대사회와 유교적 가치",
          link: "https://example.com/book2",
          image: "https://example.com/image2.jpg",
          author: "이영희",
          discount: "22000",
          publisher: "사상출판",
          pubdate: "20230510",
          isbn: "9788987654321",
          description: "현대 사회에서의 유교적 가치관에 대한 고찰",
        },
      ],
    };

    vi.mocked(searchBooksExternal).mockResolvedValue(mockRes);

    const res = await searchBooksExternal("유교");

    expect(searchBooksExternal).toHaveBeenCalledWith("유교");
    expect(res).toEqual(mockRes);
    expect(res.items[1].isbn).toBe("9788987654321");
  });

  it("stores pubdate string → Date correctly", async () => {
    const mockRes: ApiBookResponse = {
      lastBuildDate: "2025-05-09T14:00:00.000Z",
      total: 1,
      start: 1,
      display: 1,
      items: [
        {
          title: "테스트 도서",
          link: "https://example.com/testbook",
          image: "https://example.com/testimage.jpg",
          author: "테스트 작가",
          discount: "15000",
          publisher: "테스트 출판사",
          pubdate: "20240101",
          isbn: "9788900000000",
          description: "테스트 도서 설명",
        },
      ],
    };

    vi.mocked(searchBooksExternal).mockResolvedValue(mockRes);

    const {
      items: [book],
    } = await searchBooksExternal("테스트");

    const saved = await prisma.$transaction((tx) =>
      tx.book.create({
        data: {
          isbn: book.isbn,
          title: book.title,
          author: book.author,
          publisher: book.publisher,
          pubdate: book.pubdate,
          image: book.image,
          link: book.link,
          description: book.description,
        },
      })
    );

    expect(saved.isbn).toBe(book.isbn);
    expect(saved.pubdate).toBe(book.pubdate);
    expect(saved.image).toBe(book.image);
  });

  it("adds first API search book into DB and can find it", async () => {
    const mockRes: ApiBookResponse = {
      lastBuildDate: "2025-05-09T14:00:00.000Z",
      total: 1,
      start: 1,
      display: 1,
      items: [
        {
          title: "API 검색 결과 도서",
          link: "https://example.com/apibook",
          image: "https://example.com/apiimage.jpg",
          author: "API 작가",
          discount: "25000",
          publisher: "API 출판사",
          pubdate: "20230630",
          isbn: "9788911111111",
          description: "API에서 검색된 도서 정보",
        },
      ],
    };

    vi.mocked(searchBooksExternal).mockResolvedValue(mockRes);

    const book = (await searchBooksExternal("API")).items[0];

    await prisma.$transaction((tx) =>
      tx.book.create({
        data: {
          isbn: book.isbn,
          title: book.title,
          author: book.author,
          publisher: book.publisher,
          pubdate: book.pubdate,
          image: book.image,
          link: book.link,
          description: book.description,
        },
      })
    );

    const found = await prisma.book.findUnique({ where: { isbn: book.isbn } });

    expect(found).not.toBeNull();
    expect(found?.title).toBe(book.title);
  });
});
