import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

describe("Book Model", () => {
  // 각 테스트 실행 전 데이터 정리 (선택적이지만 권장)
  beforeEach(async () => {
    // 예시: BookshelfEntry와 Question이 Book을 참조하므로 함께 삭제
    await prisma.bookshelfEntry.deleteMany({});
    await prisma.question.deleteMany({});
    await prisma.book.deleteMany({});
  });

  // 모든 테스트 후 Prisma Client 연결 종료
  afterEach(async () => {
    // await prisma.$disconnect(); // Vitest 환경에서는 자동으로 처리될 수 있으나 명시적 관리가 필요할 수도 있음
  });

  it("should create a new book successfully", async () => {
    const newBookData = {
      isbn: "978-3-16-148410-0",
      title: "The Hitchhiker's Guide to the Galaxy",
      author: "Douglas Adams",
      publisher: "Pan Books",
      pubdate: "1979-10-12",
      image: "http://example.com/cover.jpg",
      link: "http://example.com/bookinfo",
      description: "A comedic science fiction series.",
    };

    const createdBook = await prisma.book.create({
      data: newBookData,
    });

    expect(createdBook.id).toBeDefined();
    expect(createdBook.isbn).toBe(newBookData.isbn);
    expect(createdBook.title).toBe(newBookData.title);
    expect(createdBook.author).toBe(newBookData.author);
    expect(createdBook.publisher).toBe(newBookData.publisher);
    expect(createdBook.pubdate).toBe(newBookData.pubdate);
    expect(createdBook.image).toBe(newBookData.image);
    expect(createdBook.link).toBe(newBookData.link);
    expect(createdBook.description).toBe(newBookData.description);
    expect(createdBook.createdAt).toBeInstanceOf(Date);
    expect(createdBook.updatedAt).toBeInstanceOf(Date);
  });

  it("should prevent creating a book with a duplicate ISBN", async () => {
    const bookData = {
      isbn: "978-0-321-76572-3",
      title: "Effective Java",
      author: "Joshua Bloch",
      publisher: "Addison-Wesley",
    };

    // 첫 번째 책 생성
    await prisma.book.create({ data: bookData });

    // 동일한 ISBN으로 두 번째 책 생성 시도
    try {
      await prisma.book.create({ data: bookData });
    } catch (e: any) {
      // Prisma 에러 코드 P2002는 고유 제약 조건 위반을 의미합니다.
      expect(e.code).toBe("P2002");
      expect(e.meta?.target).toContain("isbn"); // 또는 e.message 등으로 확인
    }
  });

  it("should find a book by ISBN", async () => {
    const bookData = {
      isbn: "978-1-93435-659-6",
      title: "Clean Code",
      author: "Robert C. Martin",
      publisher: "Prentice Hall",
    };
    await prisma.book.create({ data: bookData });

    const foundBook = await prisma.book.findUnique({
      where: { isbn: bookData.isbn },
    });

    expect(foundBook).not.toBeNull();
    expect(foundBook?.title).toBe(bookData.title);
  });

  it("should update a book", async () => {
    const initialBook = await prisma.book.create({
      data: {
        isbn: "978-0-13-235088-4",
        title: "Original Title",
        author: "Some Author",
        publisher: "Some Publisher",
      },
    });

    const updatedTitle = "Updated Book Title";
    const updatedBook = await prisma.book.update({
      where: { isbn: initialBook.isbn },
      data: { title: updatedTitle },
    });

    expect(updatedBook.title).toBe(updatedTitle);
    expect(updatedBook.isbn).toBe(initialBook.isbn); // ISBN은 변경되지 않아야 함
  });

  it("should delete a book", async () => {
    const book = await prisma.book.create({
      data: {
        isbn: "978-0-201-61622-4",
        title: "The Pragmatic Programmer",
        author: "Andrew Hunt, David Thomas",
        publisher: "Addison-Wesley",
      },
    });

    await prisma.book.delete({
      where: { isbn: book.isbn },
    });

    const deletedBook = await prisma.book.findUnique({
      where: { isbn: book.isbn },
    });
    expect(deletedBook).toBeNull();
  });

  // 선택적 필드 테스트 (null 허용)
  it("should create a book with optional fields being null", async () => {
    const newBookData = {
      isbn: "978-0-596-52068-7",
      title: "JavaScript: The Good Parts",
      author: "Douglas Crockford",
      publisher: "O'Reilly Media",
      // pubdate, image, link, description 등은 제공하지 않음
    };

    const createdBook = await prisma.book.create({
      data: newBookData,
    });

    expect(createdBook.id).toBeDefined();
    expect(createdBook.isbn).toBe(newBookData.isbn);
    expect(createdBook.pubdate).toBeNull();
    expect(createdBook.image).toBeNull();
    expect(createdBook.link).toBeNull();
    expect(createdBook.description).toBeNull();
  });
});
