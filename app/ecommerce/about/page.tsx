import Image from "next/image";
import Link from "next/link";

export default function AboutPage() {
  return (
    <div className="min-h-screen bg-[#F4F8F7]">
      {/* Hero Section */}
      <section className="relative h-96 bg-gradient-to-r from-[#0E4B4B] to-[#086666]">
        <div className="relative z-20 flex flex-col items-center justify-center h-full text-center px-4">
          <h1 className="text-4xl md:text-5xl font-bold text-[#F4F8F7] mb-4">
            হিলফুল-ফুযুল প্রকাশনী সম্পর্কে
          </h1>
          <p className="text-xl text-[#F4F8F7]/90 max-w-2xl">
            বাংলা সাহিত্য ও জ্ঞানের জন্য আপনার বিশ্বস্ত অভয়ারণ্য
          </p>
        </div>
      </section>

      {/* Story Section */}
      <section className="py-16 bg-[#F4F8F7]">
        <div className="container mx-auto px-4 max-w-4xl">
          <div className="text-center mb-12">
            <h2 className="text-3xl md:text-4xl font-bold text-[#0D1414] mb-4">
              আমাদের গল্প: পাতার জন্য একটি আবেগ
            </h2>
            <div className="w-24 h-1 bg-[#C0704D] mx-auto"></div>
          </div>

          <div className="grid md:grid-cols-2 gap-12 items-center">
            <div>
              <p className="text-lg text-[#0D1414] mb-6 leading-relaxed">
                হিলফুল-ফুযুল প্রকাশনী জন্মগ্রহণ করেছে আমাদের মাতৃভাষায় লেখা
                শব্দের জন্য একটি সহজ কিন্তু গভীর ভালবাসা থেকে। নামটিই, যার অর্থ
                "বইয়ের ঘর", আমাদের মূল লক্ষ্য প্রতিফলিত করে: প্রতিটি বাংলা
                পাঠক, চিন্তাবিদ এবং স্বপ্নদ্রষ্টার জন্য একটি বাড়ি তৈরি করা।
              </p>
              <p className="text-lg text-[#0D1414] leading-relaxed">
                বিশ্বব্যাপী বাংলা সাহিত্য সহজলভ্য করার লক্ষ্যে প্রতিষ্ঠিত, আমরা
                রবীন্দ্রনাথ ঠাকুর এবং শরৎচন্দ্র চট্টোপাধ্যায়ের কালজয়ী ক্লাসিক
                থেকে আজকের সবচেয়ে সম্মানিত লেখকদের রোমাঞ্চকর সমসাময়িক উপন্যাস
                পর্যন্ত একটি সংগ্রহ সযত্নে তৈরি করেছি।
              </p>
            </div>
            <div className="relative h-80 rounded-lg overflow-hidden shadow-xl">
              <Image
                src="/images/books-collection.jpg"
                alt="বাংলা বই সংগ্রহ"
                fill
                className="object-cover"
              />
            </div>
          </div>
        </div>
      </section>

      {/* Mission Section */}
      <section className="py-16 bg-[#0E4B4B] bg-opacity-5">
        <div className="container mx-auto px-4 max-w-4xl">
          <div className="text-center mb-12">
            <h2 className="text-3xl md:text-4xl font-bold text-[#0D1414] mb-4">
              আমাদের মিশন
            </h2>
            <div className="w-24 h-1 bg-[#C0704D] mx-auto"></div>
          </div>

          <div className="grid md:grid-cols-3 gap-8">
            <div className="text-center p-6 bg-[#F4F8F7] rounded-lg shadow-md hover:shadow-lg transition-shadow border border-[#5FA3A3] border-opacity-30">
              <div className="w-16 h-16 bg-[#0E4B4B] bg-opacity-10 rounded-full flex items-center justify-center mx-auto mb-4">
                <span className="text-2xl text-[#0E4B4B]">📚</span>
              </div>
              <h3 className="text-xl font-semibold text-[#0D1414] mb-3">
                সংরক্ষণ করা
              </h3>
              <p className="text-[#0D1414]">
                বাংলা সাহিত্যের বিশাল এবং প্রাণবন্ত ভূদৃশ্য সংরক্ষণ ও প্রচার
                করা, ভবিষ্যত প্রজন্মের জন্য ক্লাসিক এবং দুষ্প্রাপ্য রত্ন সহজলভ্য
                নিশ্চিত করা।
              </p>
            </div>

            <div className="text-center p-6 bg-[#F4F8F7] rounded-lg shadow-md hover:shadow-lg transition-shadow border border-[#5FA3A3] border-opacity-30">
              <div className="w-16 h-16 bg-[#0E4B4B] bg-opacity-10 rounded-full flex items-center justify-center mx-auto mb-4">
                <span className="text-2xl text-[#0E4B4B]">🌟</span>
              </div>
              <h3 className="text-xl font-semibold text-[#0D1414] mb-3">
                প্রচার করা
              </h3>
              <p className="text-[#0D1414]">
                সক্রিয়ভাবে নতুন এবং উদীয়মান বাংলা লেখকদের খুঁজে বের করা এবং
                প্রচার করা, নতুন কণ্ঠস্বর এবং বৈচিত্র্যময় গল্পের জন্য একটি
                প্ল্যাটফর্ম প্রদান করা।
              </p>
            </div>

            <div className="text-center p-6 bg-[#F4F8F7] rounded-lg shadow-md hover:shadow-lg transition-shadow border border-[#5FA3A3] border-opacity-30">
              <div className="w-16 h-16 bg-[#0E4B4B] bg-opacity-10 rounded-full flex items-center justify-center mx-auto mb-4">
                <span className="text-2xl text-[#0E4B4B]">🚚</span>
              </div>
              <h3 className="text-xl font-semibold text-[#0D1414] mb-3">
                সরবরাহ করা
              </h3>
              <p className="text-[#0D1414]">
                বাংলাদেশ এবং তার বাইরের বইপ্রেমীদের জন্য একটি নিরবিচ্ছিন্ন,
                নির্ভরযোগ্য এবং আনন্দদায়ক অনলাইন শপিং অভিজ্ঞতা প্রদান করা।
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* Why Choose Us Section */}
      <section className="py-16 bg-[#F4F8F7]">
        <div className="container mx-auto px-4 max-w-4xl">
          <div className="text-center mb-12">
            <h2 className="text-3xl md:text-4xl font-bold text-[#0D1414] mb-4">
              কেন হিলফুল-ফুযুল প্রকাশনী বেছে নিবেন?
            </h2>
            <div className="w-24 h-1 bg-[#C0704D] mx-auto"></div>
          </div>

          <div className="grid md:grid-cols-2 gap-8">
            <div className="flex items-start space-x-4">
              <div className="flex-shrink-0 w-12 h-12 bg-[#0E4B4B] bg-opacity-10 rounded-full flex items-center justify-center">
                <span className="text-lg text-[#0E4B4B]">✅</span>
              </div>
              <div>
                <h3 className="text-xl font-semibold text-[#0D1414] mb-2">
                  সযত্নে নির্বাচিত সংগ্রহ
                </h3>
                <p className="text-[#0D1414]">
                  আমরা শুধু বই বিক্রি করি না; আমরা সেগুলো সুপারিশ করি। আমাদের দল
                  গুণমান এবং মান নিশ্চিত করতে প্রতিটি শিরোনাম সাবধানে নির্বাচন
                  করে।
                </p>
              </div>
            </div>

            <div className="flex items-start space-x-4">
              <div className="flex-shrink-0 w-12 h-12 bg-[#0E4B4B] bg-opacity-10 rounded-full flex items-center justify-center">
                <span className="text-lg text-[#0E4B4B]">🇧🇩</span>
              </div>
              <div>
                <h3 className="text-xl font-semibold text-[#0D1414] mb-2">
                  গভীর সাংস্কৃতিক শিকড়
                </h3>
                <p className="text-[#0D1414]">
                  আমাদের ফোকাস অনন্য এবং গর্বিতভাবে বাংলা। আমরা আমাদের সাহিত্যের
                  সূক্ষ্মতা বুঝি এবং সেই সম্প্রদায়ের সেবা করি যারা এটিকে লালন
                  করে।
                </p>
              </div>
            </div>

            <div className="flex items-start space-x-4">
              <div className="flex-shrink-0 w-12 h-12 bg-[#0E4B4B] bg-opacity-10 rounded-full flex items-center justify-center">
                <span className="text-lg text-[#0E4B4D]">💝</span>
              </div>
              <div>
                <h3 className="text-xl font-semibold text-[#0D1414] mb-2">
                  গ্রাহক-কেন্দ্রিক পদ্ধতি
                </h3>
                <p className="text-[#0D1414]">
                  আপনার সাহিত্যিক যাত্রা অগ্রাধিকার। নিখুঁত বই খুঁজে
                  পাওয়া থেকে নিরাপদ বিতরণ পর্যন্ত আমরা ব্যতিক্রমী সেবা প্রদান
                  করি।
                </p>
              </div>
            </div>

            <div className="flex items-start space-x-4">
              <div className="flex-shrink-0 w-12 h-12 bg-[#0E4B4B] bg-opacity-10 rounded-full flex items-center justify-center">
                <span className="text-lg text-[#0E4B4D]">👥</span>
              </div>
              <div>
                <h3 className="text-xl font-semibold text-[#0D1414] mb-2">
                  একটি সম্প্রদায়
                </h3>
                <p className="text-[#0D1414]">
                  আমাদের ব্লগ, লেখক সাক্ষাৎকার এবং পাঠক পর্যালোচনার মাধ্যমে,
                  আমরা এমন একটি সম্প্রদায় গড়ে তুলি যেখানে বইপ্রেমীরা সংযোগ করে
                  এবং আবেগ ভাগ করে।
                </p>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Values Section */}
      <section className="py-16 bg-[#0E4B4B] bg-opacity-10">
        <div className="container mx-auto px-4 max-w-4xl">
          <div className="text-center mb-12">
            <h2 className="text-3xl md:text-4xl font-bold text-[#0D1414] mb-4">
              আমাদের মূল্যবোধ
            </h2>
            <div className="w-24 h-1 bg-[#C0704D] mx-auto"></div>
          </div>

          <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-6">
            <div className="text-center p-6 bg-[#F4F8F7] rounded-lg border-l-4 border-[#C0704D] shadow-sm">
              <h3 className="text-lg font-semibold text-[#0D1414] mb-2">
                সততা
              </h3>
              <p className="text-sm text-[#0D1414]">
                (হিলফুল ফুজুল) সমস্ত লেনদেনে সততা এবং স্বচ্ছতা নিয়ে কাজ করা।
              </p>
            </div>

            <div className="text-center p-6 bg-[#F4F8F7] rounded-lg border-l-4 border-[#0E4B4B] shadow-sm">
              <h3 className="text-lg font-semibold text-[#0D1414] mb-2">
                সাহিত্যের জন্য আবেগ
              </h3>
              <p className="text-sm text-[#0D1414]">
                আমরা প্রথমে পাঠক, তারপর উদ্যোক্তা। বইয়ের জন্য ভালবাসা আমাদের
                সবকিছু চালায়।
              </p>
            </div>

            <div className="text-center p-6 bg-[#F4F8F7] rounded-lg border-l-4 border-[#5FA3A3] shadow-sm">
              <h3 className="text-lg font-semibold text-[#0D1414] mb-2">
                প্রবেশযোগ্যতা
              </h3>
              <p className="text-sm text-[#0D1414]">
                বাংলা বই সবার জন্য, সর্বত্র সহজলভ্য করা, বাধা ভেঙে দেওয়া।
              </p>
            </div>

            <div className="text-center p-6 bg-[#F4F8F7] rounded-lg border-l-4 border-[#086666] shadow-sm">
              <h3 className="text-lg font-semibold text-[#0D1414] mb-2">
                গুণমান
              </h3>
              <p className="text-sm text-[#0D1414]">
                বই সোর্সিং থেকে প্যাকেজিং পর্যন্ত সর্বোচ্চ মানের জন্য
                প্রতিশ্রুতিবদ্ধ।
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* CTA Section */}
      <section className="py-16 bg-gradient-to-r from-[#0E4B4B] to-[#086666] text-[#F4F8F7]">
        <div className="container mx-auto px-4 text-center max-w-2xl">
          <h2 className="text-3xl md:text-4xl font-bold mb-6">
            আমাদের সাহিত্যিক যাত্রায় যোগ দিন
          </h2>
          <p className="text-xl mb-8 text-[#F4F8F7]/90">
            আমাদের ভার্চুয়াল তাকগুলি অন্বেষণ করুন, আপনার পরবর্তী প্রিয় বইটি
            আবিষ্কার করুন এবং হিলফুল-ফুযুল প্রকাশনী পরিবারের অংশ হয়ে উঠুন।
          </p>
          <div className="flex flex-col sm:flex-row gap-4 justify-center">
            <Link
              href="/ecommerce/books"
              className="bg-[#F4F8F7] text-[#0E4B4B] px-8 py-3 rounded-lg font-semibold hover:bg-[#F4F8F7]/90 transition-colors shadow-lg hover:scale-105 duration-300"
            >
              আমাদের সংগ্রহ ব্রাউজ করুন
            </Link>
            <Link
              href="/ecommerce/contact"
              className="border-2 border-[#F4F8F7] text-[#F4F8F7] px-8 py-3 rounded-lg font-semibold hover:bg-[#F4F8F7] hover:text-[#0E4B4B] transition-colors hover:scale-105 duration-300"
            >
              যোগাযোগ করুন
            </Link>
          </div>
        </div>
      </section>

      {/* Footer Note */}
      <div className="bg-[#0E4B4B] text-[#F4F8F7] py-8">
        <div className="container mx-auto px-4 text-center">
          <p className="text-2xl font-light italic mb-2">
            হিলফুল-ফুযুল প্রকাশনী বেছে নেওয়ার জন্য ধন্যবাদ
          </p>
          <p className="text-[#5FA3A3]">
            যেখানে প্রতিটি বই একটি গল্প বলে, এবং প্রতিটি পাঠক একটি বাড়ি খুঁজে
            পায়।
          </p>
          <p className="text-[#5FA3A3] mt-4">
            <strong>হিলফুল-ফুযুল প্রকাশনী টিম</strong>
          </p>
        </div>
      </div>
    </div>
  );
}
