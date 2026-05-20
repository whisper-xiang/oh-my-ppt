import * as DialogPrimitive from '@radix-ui/react-dialog'
import React from 'react'
import { cn } from '@renderer/lib/utils'

export const Sheet = DialogPrimitive.Root
export const SheetTrigger = DialogPrimitive.Trigger
export const SheetClose = DialogPrimitive.Close
export const SheetPortal = DialogPrimitive.Portal

export const SheetOverlay = React.forwardRef<
  React.ElementRef<typeof DialogPrimitive.Overlay>,
  React.ComponentPropsWithoutRef<typeof DialogPrimitive.Overlay>
>(({ className, ...props }, ref) => (
  <DialogPrimitive.Overlay
    ref={ref}
    className={cn('fixed inset-0 z-40', className)}
    {...props}
  />
))
SheetOverlay.displayName = 'SheetOverlay'

export const SheetContent = React.forwardRef<
  React.ElementRef<typeof DialogPrimitive.Content>,
  React.ComponentPropsWithoutRef<typeof DialogPrimitive.Content>
>(({ className, children, ...props }, ref) => (
  <SheetPortal>
    <SheetOverlay />
    <DialogPrimitive.Content
      ref={ref}
      className={cn(
        'fixed right-0 z-50 flex flex-col bg-[#f5f2ee] shadow-[-4px_0_20px_rgba(60,50,40,0.10)]',
        'top-[var(--app-titlebar-height)] h-[calc(100vh-var(--app-titlebar-height))]',
        'translate-x-full transition-transform duration-300 ease-in-out',
        'data-[state=open]:translate-x-0',
        'focus:outline-none',
        className
      )}
      {...props}
    >
      {children}
    </DialogPrimitive.Content>
  </SheetPortal>
))
SheetContent.displayName = 'SheetContent'

export const SheetTitle = DialogPrimitive.Title
export const SheetDescription = DialogPrimitive.Description
