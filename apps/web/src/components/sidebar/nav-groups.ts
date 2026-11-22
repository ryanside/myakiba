type NavItem = {
  readonly title: string;
  readonly url: string;
  readonly pathnameMatch?: "prefix";
};

export const NAV_GROUPS: readonly { readonly label: string; readonly items: readonly NavItem[] }[] =
  [
    {
      label: "Overview",
      items: [
        { title: "Dashboard", url: "/dashboard" },
        { title: "Calendar", url: "/calendar" },
        { title: "Analytics", url: "/analytics", pathnameMatch: "prefix" },
        { title: "Expenses", url: "/expenses", pathnameMatch: "prefix" },
      ],
    },
    {
      label: "Library",
      items: [
        { title: "Collection", url: "/collection" },
        { title: "Orders", url: "/orders", pathnameMatch: "prefix" },
        { title: "Wishlist", url: "/wishlist" },
        { title: "Lists", url: "/lists", pathnameMatch: "prefix" },
        { title: "Item Database", url: "/items" },
      ],
    },
  ];
