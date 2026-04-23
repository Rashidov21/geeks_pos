import { create } from 'zustand'

export type CartLine = {
  variantId: string
  barcode: string
  name: string
  sizeLabel: string
  colorLabel: string
  listPrice: string
  qty: number
}

export type PayMode = 'CASH' | 'CARD' | 'DEBT'

type PosState = {
  cart: CartLine[]
  payMode: PayMode
  customerName: string
  customerPhone: string
  addLine: (line: Omit<CartLine, 'qty'> & { qty?: number }) => void
  incQty: (variantId: string, delta: number) => void
  clearCart: () => void
  setPayMode: (m: PayMode) => void
  setCustomer: (name: string, phone: string) => void
}

export const usePosStore = create<PosState>((set, get) => ({
  cart: [],
  payMode: 'CASH',
  customerName: '',
  customerPhone: '',
  addLine: (line) => {
    const cart = get().cart
    const existing = cart.find((c) => c.variantId === line.variantId)
    const add = line.qty ?? 1
    if (existing) {
      set({
        cart: cart.map((c) =>
          c.variantId === line.variantId ? { ...c, qty: c.qty + add } : c,
        ),
      })
    } else {
      set({
        cart: [
          ...cart,
          {
            variantId: line.variantId,
            barcode: line.barcode,
            name: line.name,
            sizeLabel: line.sizeLabel,
            colorLabel: line.colorLabel,
            listPrice: line.listPrice,
            qty: add,
          },
        ],
      })
    }
  },
  incQty: (variantId, delta) => {
    set({
      cart: get()
        .cart.map((c) =>
          c.variantId === variantId ? { ...c, qty: Math.max(0, c.qty + delta) } : c,
        )
        .filter((c) => c.qty > 0),
    })
  },
  clearCart: () => set({ cart: [] }),
  setPayMode: (m) => set({ payMode: m }),
  setCustomer: (name, phone) => set({ customerName: name, customerPhone: phone }),
}))
