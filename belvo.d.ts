declare module 'belvo' {
  export default class Client {
    constructor(clientId: string, clientSecret: string, environment?: string)
    connect(): Promise<void>
    accounts: { retrieve(link: string): Promise<any[]> }
    investmentPortfolios?: { retrieve(link: string): Promise<any[]> }
  }
}
