import { describe, it, expect, vi, beforeEach } from "vitest";
import { PrismaClient } from "@prisma/client";
import { searchBooksExternal, ApiBookResponse, ApiBookItem } from "../services/book_api";

vi.mock("../services/book_api", async () => {
  const actual = await vi.importActual("../services/book_api");
  return {
    ...actual,
    searchBooksExternal: vi.fn(),
  };
});

const prisma = new PrismaClient();

describe("Book API Integration", () => {
  beforeEach(async () => {
    await prisma.bookshelfEntry.deleteMany({});
    await prisma.question.deleteMany({});
    await prisma.book.deleteMany({});
    
    vi.resetAllMocks();
  });

  it("should search books from external API", async () => {
    const mockApiResponse: ApiBookResponse = {
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
          pubdate: "20220315", // YYYYMMDD 형식
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
          pubdate: "20230510", // YYYYMMDD 형식
          isbn: "9788987654321",
          description: "현대 사회에서의 유교적 가치관에 대한 고찰",
        },
      ],
    };

    vi.mocked(searchBooksExternal).mockResolvedValue(mockApiResponse);

    const result = await searchBooksExternal("유교");

    expect(searchBooksExternal).toHaveBeenCalledWith("유교");
    
    expect(result).toEqual(mockApiResponse);
    expect(result.items.length).toBe(2);
    expect(result.items[0].title).toBe("유교와 한국사회");
    expect(result.items[1].isbn).toBe("9788987654321");
  });

  it("should handle pubdate as String type correctly", async () => {
    const mockApiResponse: ApiBookResponse = {
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
          pubdate: "20240101", // YYYYMMDD 형식
          isbn: "9788900000000",
          description: "테스트 도서 설명",
        },
      ],
    };

    vi.mocked(searchBooksExternal).mockResolvedValue(mockApiResponse);

    const result = await searchBooksExternal("테스트");

    expect(result.items[0].pubdate).toBe("20240101");
    
    const bookData = {
      isbn: result.items[0].isbn,
      title: result.items[0].title,
      author: result.items[0].author,
      publisher: result.items[0].publisher,
      pubdate: result.items[0].pubdate, // String 타입 그대로 사용
      image: result.items[0].image,
      link: result.items[0].link,
      description: result.items[0].description,
    };

    const createdBook = await prisma.book.create({
      data: bookData,
    });

    expect(createdBook.pubdate).toBe("20240101");
    expect(typeof createdBook.pubdate).toBe("string");
  });

  it("should add a book to database from API search results", async () => {
    const mockApiResponse: ApiBookResponse = {
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
          pubdate: "20230630", // YYYYMMDD 형식
          isbn: "9788911111111",
          description: "API에서 검색된 도서 정보",
        },
      ],
    };

    vi.mocked(searchBooksExternal).mockResolvedValue(mockApiResponse);

    const searchResult = await searchBooksExternal("API");
    const bookItem = searchResult.items[0];

    const createdBook = await prisma.book.create({
      data: {
        isbn: bookItem.isbn,
        title: bookItem.title,
        author: bookItem.author,
        publisher: bookItem.publisher,
        pubdate: bookItem.pubdate,
        image: bookItem.image,
        link: bookItem.link,
        description: bookItem.description,
      },
    });

    expect(createdBook.isbn).toBe(bookItem.isbn);
    expect(createdBook.title).toBe(bookItem.title);
    expect(createdBook.pubdate).toBe(bookItem.pubdate);

    const foundBook = await prisma.book.findUnique({
      where: { isbn: bookItem.isbn },
    });

    expect(foundBook).not.toBeNull();
    expect(foundBook?.title).toBe(bookItem.title);
  });
});
