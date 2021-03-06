import React from 'react';
import { Prisma } from '@prisma/client';
import { json, useLoaderData } from 'remix';
import { endOfYear, startOfYear } from 'date-fns';
import type { MetaFunction, LoaderFunction } from 'remix';

import { SneakerCard } from '../components/sneaker';
import { prisma } from '../db.server';
import { NotFoundError } from '../errors';
import { redis, saveByPage } from '../lib/redis.server';
import FourOhFour, { meta as fourOhFourMeta } from '../components/not-found';

const userWithSneakers = Prisma.validator<Prisma.UserArgs>()({
  select: { username: true, sneakers: { include: { brand: true } } },
});

type UserWithSneakers = Prisma.UserGetPayload<typeof userWithSneakers>;

type RouteData =
  | {
      user: UserWithSneakers;
      year: number;
    }
  | {
      user?: never;
      year: number;
    };

const loader: LoaderFunction = async ({ params }) => {
  const { username } = params;
  const year = parseInt(params.year!, 10);

  const cacheKey = `${username}.yir.${params.year!}`;

  const now = new Date();
  const date = new Date(year, now.getMonth(), now.getDate());

  try {
    if (year > now.getFullYear()) {
      throw new NotFoundError();
    }

    const cache = await redis.get(cacheKey);

    if (cache) {
      const user = JSON.parse(cache) as UserWithSneakers;
      const data: RouteData = { year, user };
      return json(data);
    }

    const user = await prisma.user.findUnique({
      where: { username },
      select: {
        username: true,
        sneakers: {
          orderBy: { purchaseDate: 'asc' },
          include: { brand: true },
          where: {
            purchaseDate: {
              gte: startOfYear(date),
              lte: endOfYear(date),
            },
          },
        },
      },
    });

    if (!user) {
      throw new NotFoundError();
    }

    await saveByPage(cacheKey, user, 60 * 5 * 1000);

    const data: RouteData = { year, user };

    return json(data);
  } catch (error: unknown) {
    const data: RouteData = { year };

    if (error instanceof NotFoundError) {
      return json(data, { status: 404 });
    }

    console.error(error);
    return json(data, { status: 500 });
  }
};

const meta: MetaFunction = args => {
  const data = args.data as RouteData;
  if (!data.user) {
    return fourOhFourMeta(args);
  }

  const sneakers = data.user.sneakers.length === 1 ? 'sneaker' : 'sneakers';
  return {
    title: `${data.year} ??? ${data.user.username}`,
    description: `${data.user.username} bought ${data.user.sneakers.length} ${sneakers} in ${data.year}`,
  };
};

const SneakersYearInReview: React.VFC = () => {
  const { user, year } = useLoaderData<RouteData>();

  if (!user || year > new Date().getFullYear()) {
    return <FourOhFour />;
  }

  if (!user.sneakers.length) {
    return (
      <div className="flex items-center justify-center w-full h-full text-lg text-center">
        <p>
          {user.username} didn&apos;t buy any sneakers in {year}
        </p>
      </div>
    );
  }

  return (
    <main className="container h-full p-4 pb-6 mx-auto">
      <h1 className="pb-2 text-xl xs:text-2xl sm:text-4xl">
        Sneakers bought in {year} ??? {user.sneakers.length}
        {new Date().getFullYear() === year && ` and counting`}
      </h1>

      <ul className="grid grid-cols-2 gap-2 sm:gap-x-6 gap-y-8 lg:grid-cols-4 xl:gap-x-8">
        {user.sneakers.map(sneaker => (
          <SneakerCard key={sneaker.id} {...sneaker} />
        ))}
      </ul>
    </main>
  );
};

export default SneakersYearInReview;
export { meta, loader };
