"use client"

import * as React from "react"
import { Dialog as DialogPrimitive } from "@base-ui/react/dialog"

import { cn } from "@/lib/utils"
import { useVisualViewport, type VisualViewportSize } from "@/lib/use-visual-viewport"
import { Button } from "@/components/ui/button"
import { XIcon } from "lucide-react"

const H_PAD = 16
const V_PAD = 8

function getIsMobileViewport() {
  if (typeof window === "undefined") return false
  return window.matchMedia("(max-width: 639px)").matches
}

function getMobileBoxStyle(
  visualViewport: VisualViewportSize,
  enableTransition: boolean,
): React.CSSProperties {
  const boxWidth = Math.max(visualViewport.width - H_PAD, 280)
  const centerY = visualViewport.offsetTop + visualViewport.height / 2
  const maxHeight = Math.max(visualViewport.height - V_PAD * 2, 200)

  return {
    left: `${visualViewport.offsetLeft + H_PAD / 2}px`,
    width: `${boxWidth}px`,
    maxWidth: `${boxWidth}px`,
    right: "auto",
    top: `${centerY}px`,
    bottom: "auto",
    transform: "translateY(-50%)",
    maxHeight: `${maxHeight}px`,
    ...(enableTransition && {
      transition: "top 200ms ease, max-height 200ms ease",
    }),
  }
}

function scrollFieldIntoDialogBody(target: HTMLElement) {
  const scrollParent = target.closest("[data-dialog-scroll-body]")
  if (!(scrollParent instanceof HTMLElement)) return

  const parentRect = scrollParent.getBoundingClientRect()
  const targetRect = target.getBoundingClientRect()
  const nextTop =
    targetRect.top - parentRect.top + scrollParent.scrollTop - V_PAD

  scrollParent.scrollTo({
    top: Math.max(0, nextTop),
    behavior: "smooth",
  })
}

function Dialog({ ...props }: DialogPrimitive.Root.Props) {
  return <DialogPrimitive.Root data-slot="dialog" {...props} />
}

function DialogTrigger({ ...props }: DialogPrimitive.Trigger.Props) {
  return <DialogPrimitive.Trigger data-slot="dialog-trigger" {...props} />
}

function DialogPortal({ ...props }: DialogPrimitive.Portal.Props) {
  return <DialogPrimitive.Portal data-slot="dialog-portal" {...props} />
}

function DialogClose({ ...props }: DialogPrimitive.Close.Props) {
  return <DialogPrimitive.Close data-slot="dialog-close" {...props} />
}

function DialogOverlay({
  className,
  ...props
}: DialogPrimitive.Backdrop.Props) {
  return (
    <DialogPrimitive.Backdrop
      data-slot="dialog-overlay"
      className={cn(
        "fixed inset-0 isolate z-50 bg-black/10 duration-100 supports-backdrop-filter:backdrop-blur-xs data-open:animate-in data-open:fade-in-0 data-closed:animate-out data-closed:fade-out-0",
        className
      )}
      {...props}
    />
  )
}

function DialogContent({
  className,
  children,
  showCloseButton = true,
  keyboardAware = false,
  style,
  onFocusCapture,
  ...props
}: DialogPrimitive.Popup.Props & {
  showCloseButton?: boolean
  keyboardAware?: boolean
}) {
  const popupRef = React.useRef<HTMLDivElement>(null)
  const [isMobile, setIsMobile] = React.useState(getIsMobileViewport)

  React.useEffect(() => {
    if (!keyboardAware) return

    const mq = window.matchMedia("(max-width: 639px)")
    const update = () => setIsMobile(mq.matches)

    update()
    mq.addEventListener("change", update)
    return () => mq.removeEventListener("change", update)
  }, [keyboardAware])

  const visualViewport = useVisualViewport(keyboardAware && isMobile)

  const [positioned, setPositioned] = React.useState(false)

  React.useEffect(() => {
    if (!keyboardAware || !isMobile) return

    const id = requestAnimationFrame(() => setPositioned(true))
    return () => cancelAnimationFrame(id)
  }, [keyboardAware, isMobile])

  const [reducedMotion, setReducedMotion] = React.useState(false)

  React.useEffect(() => {
    if (!keyboardAware || !isMobile) return

    const mq = window.matchMedia("(prefers-reduced-motion: reduce)")
    const update = () => setReducedMotion(mq.matches)

    update()
    mq.addEventListener("change", update)
    return () => mq.removeEventListener("change", update)
  }, [keyboardAware, isMobile])

  React.useEffect(() => {
    if (!keyboardAware || !isMobile) return

    const popup = popupRef.current
    if (!popup) return

    function handleFocusIn(event: FocusEvent) {
      const target = event.target
      if (
        target instanceof HTMLInputElement ||
        target instanceof HTMLTextAreaElement ||
        target instanceof HTMLSelectElement
      ) {
        requestAnimationFrame(() => {
          scrollFieldIntoDialogBody(target)
        })
      }
    }

    popup.addEventListener("focusin", handleFocusIn)
    return () => popup.removeEventListener("focusin", handleFocusIn)
  }, [keyboardAware, isMobile])

  const mobileBoxStyle =
    keyboardAware && isMobile
      ? getMobileBoxStyle(visualViewport, positioned && !reducedMotion)
      : undefined

  return (
    <DialogPortal>
      <DialogOverlay />
      <DialogPrimitive.Popup
        ref={popupRef}
        data-slot="dialog-content"
        className={cn(
          "fixed top-1/2 left-1/2 z-50 grid w-full max-w-[calc(100%-2rem)] -translate-x-1/2 -translate-y-1/2 gap-4 rounded-xl bg-popover p-4 text-sm text-popover-foreground ring-1 ring-foreground/10 duration-100 outline-none sm:max-w-sm data-open:animate-in data-open:fade-in-0 data-open:zoom-in-95 data-closed:animate-out data-closed:fade-out-0 data-closed:zoom-out-95",
          keyboardAware &&
            "max-sm:left-auto max-sm:w-auto max-sm:max-w-none max-sm:translate-x-0 max-sm:translate-y-0 max-sm:overflow-hidden max-sm:min-h-0 flex flex-col",
          className
        )}
        style={{ ...style, ...mobileBoxStyle }}
        onFocusCapture={onFocusCapture}
        {...props}
      >
        {children}
        {showCloseButton && (
          <DialogPrimitive.Close
            data-slot="dialog-close"
            render={
              <Button
                variant="ghost"
                className="absolute top-2 right-2"
                size="icon-sm"
              />
            }
          >
            <XIcon
            />
            <span className="sr-only">Close</span>
          </DialogPrimitive.Close>
        )}
      </DialogPrimitive.Popup>
    </DialogPortal>
  )
}

function DialogHeader({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="dialog-header"
      className={cn("flex flex-col gap-2", className)}
      {...props}
    />
  )
}

function DialogFooter({
  className,
  showCloseButton = false,
  children,
  ...props
}: React.ComponentProps<"div"> & {
  showCloseButton?: boolean
}) {
  return (
    <div
      data-slot="dialog-footer"
      className={cn(
        "-mx-4 -mb-4 flex flex-col-reverse gap-2 rounded-b-xl border-t bg-muted/50 p-4 sm:flex-row sm:justify-end",
        className
      )}
      {...props}
    >
      {children}
      {showCloseButton && (
        <DialogPrimitive.Close render={<Button variant="outline" />}>
          Close
        </DialogPrimitive.Close>
      )}
    </div>
  )
}

function DialogTitle({ className, ...props }: DialogPrimitive.Title.Props) {
  return (
    <DialogPrimitive.Title
      data-slot="dialog-title"
      className={cn(
        "font-heading text-base leading-none font-medium",
        className
      )}
      {...props}
    />
  )
}

function DialogDescription({
  className,
  ...props
}: DialogPrimitive.Description.Props) {
  return (
    <DialogPrimitive.Description
      data-slot="dialog-description"
      className={cn(
        "text-sm text-muted-foreground *:[a]:underline *:[a]:underline-offset-3 *:[a]:hover:text-foreground",
        className
      )}
      {...props}
    />
  )
}

export {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogOverlay,
  DialogPortal,
  DialogTitle,
  DialogTrigger,
}
