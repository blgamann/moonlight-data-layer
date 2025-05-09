// tests/book.spec.ts
import { describe, it, expect, beforeEach } from "vitest";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

describe("Book Model (transactional)", () => {
  // 테스트 전 DB 정리
  beforeEach(async () => {
    await prisma.$transaction([
      prisma.bookshelfEntry.deleteMany(),
      prisma.question.deleteMany(),
      prisma.book.deleteMany(),
    ]);
  });

  it("creates a new book successfully", async () => {
    const data = {
      isbn: "978-3-16-148410-0",
      title: "The Hitchhiker's Guide to the Galaxy",
      author: "Douglas Adams",
      publisher: "Pan Books",
      pubdate: "1979-10-12",
      image: "http://example.com/cover.jpg",
      link: "http://example.com/bookinfo",
      description: "A comedic science fiction series.",
    };

    const created = await prisma.$transaction((tx) => tx.book.create({ data }));

    expect(created.id).toBeDefined();
    expect(created.isbn).toBe(data.isbn);
    expect(created.image).toBe(data.image);
    expect(created.createdAt).toBeInstanceOf(Date);
  });

  it("prevents duplicate ISBN", async () => {
    const data = {
      isbn: "978-0-321-76572-3",
      title: "Effective Java",
      author: "Joshua Bloch",
      publisher: "Addison-Wesley",
    };

    await prisma.book.create({ data });

    await expect(prisma.book.create({ data })).rejects.toMatchObject({
      code: "P2002",
      meta: expect.objectContaining({
        target: expect.arrayContaining(["isbn"]),
      }),
    });
  });

  it("finds a book by ISBN", async () => {
    const data = {
      isbn: "978-1-93435-659-6",
      title: "Clean Code",
      author: "Robert C. Martin",
      publisher: "Prentice Hall",
    };
    await prisma.book.create({ data });

    const found = await prisma.$transaction((tx) =>
      tx.book.findUnique({ where: { isbn: data.isbn } })
    );

    expect(found?.title).toBe(data.title);
  });

  it("updates a book title", async () => {
    const initial = await prisma.book.create({
      data: {
        isbn: "978-0-13-235088-4",
        title: "Original Title",
        author: "Some Author",
        publisher: "Some Publisher",
      },
    });

    const updated = await prisma.$transaction((tx) =>
      tx.book.update({
        where: { isbn: initial.isbn },
        data: { title: "Updated Book Title" },
      })
    );

    expect(updated.title).toBe("Updated Book Title");
    expect(updated.isbn).toBe(initial.isbn);
  });

  it("deletes a book", async () => {
    const book = await prisma.book.create({
      data: {
        isbn: "978-0-201-61622-4",
        title: "The Pragmatic Programmer",
        author: "Andrew Hunt, David Thomas",
        publisher: "Addison-Wesley",
      },
    });

    await prisma.$transaction((tx) =>
      tx.book.delete({ where: { isbn: book.isbn } })
    );

    const shouldBeNull = await prisma.book.findUnique({
      where: { isbn: book.isbn },
    });
    expect(shouldBeNull).toBeNull();
  });

  it("creates a book with optional fields null", async () => {
    const data = {
      isbn: "978-0-596-52068-7",
      title: "JavaScript: The Good Parts",
      author: "Douglas Crockford",
      publisher: "O'Reilly Media",
    };

    const created = await prisma.$transaction((tx) => tx.book.create({ data }));

    expect(created.pubdate).toBeNull();
    expect(created.image).toBeNull();
    expect(created.link).toBeNull();
    expect(created.description).toBeNull();
  });
});
