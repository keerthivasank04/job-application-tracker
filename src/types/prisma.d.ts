declare module '@prisma/orm-postgres/runtime' {
  const postgres: <TContract>(options: {
    contractJson: any;
    url?: string;
    [key: string]: any;
  }) => any;
  export default postgres;
}
