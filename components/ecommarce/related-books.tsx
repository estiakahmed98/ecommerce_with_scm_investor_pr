import Link from "next/link";
import Image from "next/image";
import { Card, CardContent } from "@/components/ui/card";

interface Book {
  id: string | number;
  name: string;
  image: string;
  price: number;
  original_price: number;
  discount: number;
  writer: {
    name: string;
  };
}

interface RelatedBooksProps {
  books: Book[];
}

export default function RelatedBooks({ books }: RelatedBooksProps) {
  return (
    <div>
      <h3 className="text-xl font-bold mb-4">সম্পর্কিত বই</h3>
      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-6">
        {books.map((book) => (
          <Card key={book.id} className="overflow-hidden">
            <Link href={`/ecommerce/books/${book.id}`}>
              <div className="relative w-full aspect-[3/4] sm:aspect-[4/5] lg:aspect-[3/4] max-w-[500px] mx-auto rounded-xl overflow-hidden bg-gray-50 group">
                <Image
                  src={book.image}
                  alt={book.name}
                  fill
                  className="object-cover transition-transform hover:scale-105"
                />
              </div>
            </Link>
            <CardContent className="p-4">
              <Link href={`/ecommerce/books/${book.id}`}>
                <h4 className="font-semibold text-lg mb-1 hover:text-primary transition-colors line-clamp-2">
                  {book.name}
                </h4>
              </Link>
              <p className="text-sm text-muted-foreground mb-2">
                {book.writer.name}
              </p>
              <div>
                <span className="font-bold">৳{book.price}</span>
                {book.discount > 0 && (
                  <span className="text-sm text-muted-foreground line-through ml-2">
                    ৳{book.original_price}
                  </span>
                )}
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
