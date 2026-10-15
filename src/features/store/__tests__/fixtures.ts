import type { PublicProduct, PublicStore } from '@orbitsystems/gastrohub-contracts';

export const burger: PublicProduct = {
  id: 'p1',
  slug: 'x-bacon',
  name: 'X-Bacon',
  description: null,
  priceCents: 3000,
  imageUrl: null,
  featured: false,
  available: true,
  categoryId: 'c1',
  optionGroups: [
    {
      id: 'bread',
      name: 'Pão',
      minSelect: 1,
      maxSelect: 1,
      options: [
        { id: 'trad', name: 'Tradicional', priceCents: 0, available: true },
        { id: 'brioche', name: 'Brioche', priceCents: 300, available: true },
      ],
    },
    {
      id: 'extras',
      name: 'Adicionais',
      minSelect: 0,
      maxSelect: 2,
      options: [
        { id: 'bacon', name: 'Bacon', priceCents: 500, available: true },
        { id: 'cheddar', name: 'Cheddar', priceCents: 400, available: true },
        { id: 'egg', name: 'Ovo', priceCents: 250, available: true },
      ],
    },
  ],
};

export function storeWith(products: PublicProduct[]): PublicStore {
  return {
    id: 'r1',
    slug: 'loja',
    name: 'Loja',
    description: null,
    logoUrl: null,
    bannerUrl: null,
    primaryColor: '#c2410c',
    whatsapp: null,
    addressLine: null,
    city: null,
    state: null,
    timezone: 'America/Sao_Paulo',
    openingHours: {},
    isOpen: true,
    acceptingOrders: true,
    notAcceptingReason: null,
    delivery: {
      deliveryEnabled: true,
      pickupEnabled: true,
      deliveryFeeCents: 700,
      freeDeliveryAboveCents: null,
      minOrderCents: 0,
      estimatedMinutesMin: 30,
      estimatedMinutesMax: 40,
    },
    acceptedPaymentMethods: ['CASH'],
    couponsEnabled: false,
    showPoweredBy: true,
    categories: [{ id: 'c1', name: 'Burgers', products }],
  };
}
