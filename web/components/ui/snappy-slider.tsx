"use client";

import * as React from "react";

import { cn } from "@/lib/utils";

interface CustomSliderProps {
  values: number[];
  defaultValue: number;
  value?: number;
  resetKey?: number;
  snapping?: boolean;
  min?: number;
  max?: number;
  step?: number;
  onChange: (value: number) => void;
  config?: {
    snappingThreshold?: number;
    labelFormatter?: (value: number) => string;
  };
  label: string;
  prefix?: string;
  suffix?: string;
  /** Dark Kaido trade panel styling — avoids fragile parent arbitrary variants. */
  tone?: "default" | "kaido";
  className?: string;
}

const formatNumber = (value: number, step: number = 1): string => {
  const numValue = Number(value);

  if (isNaN(numValue)) {
    throw new Error(`Invalid number value: ${value}`);
  }

  const decimalPlaces = step.toString().split(".")[1]?.length || 0;
  if (decimalPlaces === 0 && Number.isInteger(numValue)) {
    return numValue.toString();
  }
  return numValue.toFixed(decimalPlaces);
};

/**
 * SnappySlider — range input with snap points, direct numeric entry, and drag support.
 */
const SnappySlider = React.forwardRef<HTMLDivElement, CustomSliderProps>(
  (
    {
      values,
      defaultValue,
      value,
      snapping = true,
      min: providedMin,
      max: providedMax,
      step,
      onChange,
      config = {},
      label,
      prefix,
      suffix,
      tone = "default",
      className,
      ...props
    },
    ref,
  ) => {
    const sliderRef = React.useRef<HTMLDivElement>(null);
    const { snappingThreshold = 1, labelFormatter } = config;
    const kaido = tone === "kaido";

    const defaultValueArray = [...values, defaultValue].sort((a, b) => a - b);

    const inputMin = providedMin ?? Math.min(...defaultValueArray);
    const inputMax = providedMax ?? Math.max(...defaultValueArray);

    const sliderValues =
      providedMin !== undefined && providedMax !== undefined
        ? defaultValueArray.filter((v) => v >= providedMin && v <= providedMax)
        : defaultValueArray;

    const sliderMin = Math.min(...sliderValues);
    const sliderMax = Math.max(...sliderValues);

    const computedStep = step ?? (label.includes("Duration") ? 1 : 0.1);

    const formatDisplay = React.useCallback(
      (v: number) => (labelFormatter ? labelFormatter(v) : formatNumber(v, computedStep)),
      [labelFormatter, computedStep],
    );

    const [internalValue, setInternalValue] = React.useState(defaultValue);
    const currentValue = value ?? internalValue;

    const [inputValue, setInputValue] = React.useState(formatDisplay(currentValue));

    const isOutOfBounds = currentValue < sliderMin || currentValue > sliderMax;

    const sliderPercentage =
      ((Math.min(Math.max(currentValue, sliderMin), sliderMax) - sliderMin) / (sliderMax - sliderMin)) * 100;

    React.useEffect(() => {
      if (value !== undefined) {
        setInternalValue(value);
        setInputValue(formatDisplay(value));
      }
    }, [value, formatDisplay]);

    const handleValueChange = (newValue: number) => {
      setInternalValue(newValue);
      setInputValue(formatDisplay(newValue));
      onChange(newValue);
    };

    const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
      setInputValue(e.target.value);
    };

    const handleInputBlur = () => {
      const newValue = Number(inputValue);

      if (isNaN(newValue)) {
        setInputValue(formatDisplay(currentValue));
      } else {
        const clampedValue = Math.max(inputMin, Math.min(inputMax, newValue));
        const steppedValue = Math.round(clampedValue / computedStep) * computedStep;
        setInputValue(formatDisplay(steppedValue));
        handleValueChange(steppedValue);
      }
    };

    const handleInteraction = React.useCallback(
      (clientX: number) => {
        const slider = sliderRef.current;
        if (!slider) return;

        const rect = slider.getBoundingClientRect();
        const percentage = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
        const rawValue = percentage * (sliderMax - sliderMin) + sliderMin;

        if (snapping) {
          const snapPoints = [...new Set([...defaultValueArray, currentValue])].sort((a, b) => a - b);
          const closestValue = snapPoints.reduce((prev, curr) => {
            return Math.abs(curr - rawValue) < Math.abs(prev - rawValue) ? curr : prev;
          });

          if (Math.abs(closestValue - rawValue) <= snappingThreshold) {
            handleValueChange(closestValue);
            return;
          }
        }

        const steppedValue = Math.round(rawValue / computedStep) * computedStep;
        const clampedValue = Math.max(sliderMin, Math.min(sliderMax, steppedValue));
        handleValueChange(clampedValue);
      },
      [sliderMin, sliderMax, defaultValueArray, currentValue, computedStep, snapping, snappingThreshold],
    );

    React.useEffect(() => {
      const slider = sliderRef.current;
      if (!slider) return;

      const handleMouseDown = (e: MouseEvent) => {
        e.preventDefault();
        handleInteraction(e.clientX);
        document.body.style.userSelect = "none";

        const handleMouseMove = (e: MouseEvent) => {
          handleInteraction(e.clientX);
        };

        const handleMouseUp = () => {
          document.removeEventListener("mousemove", handleMouseMove);
          document.body.style.userSelect = "";
        };

        document.addEventListener("mousemove", handleMouseMove);
        document.addEventListener("mouseup", handleMouseUp, { once: true });
      };

      const handleTouchStart = (e: TouchEvent) => {
        e.preventDefault();
        handleInteraction(e.touches[0].clientX);

        const handleTouchMove = (e: TouchEvent) => {
          handleInteraction(e.touches[0].clientX);
        };

        document.addEventListener("touchmove", handleTouchMove, { passive: false });
        document.addEventListener(
          "touchend",
          () => {
            document.removeEventListener("touchmove", handleTouchMove);
          },
          { once: true },
        );
      };

      slider.addEventListener("mousedown", handleMouseDown);
      slider.addEventListener("touchstart", handleTouchStart, { passive: false });

      return () => {
        slider.removeEventListener("mousedown", handleMouseDown);
        slider.removeEventListener("touchstart", handleTouchStart);
        document.body.style.userSelect = "";
      };
    }, [handleInteraction]);

    React.useEffect(() => {
      const slider = sliderRef.current;
      if (!slider) return;

      const handleDoubleClick = () => {
        onChange(defaultValue);
      };

      slider.addEventListener("dblclick", handleDoubleClick);
      return () => slider.removeEventListener("dblclick", handleDoubleClick);
    }, [onChange, defaultValue]);

    const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
      if (e.key === "ArrowUp" || e.key === "ArrowDown") {
        e.preventDefault();
        const parsed = Number(inputValue);
        if (isNaN(parsed)) return;

        const newValue = parsed + (e.key === "ArrowUp" ? computedStep : -computedStep);
        const clampedValue = Math.max(sliderMin, Math.min(sliderMax, newValue));

        setInputValue(formatDisplay(clampedValue));
        onChange(clampedValue);
      }
    };

    return (
      <div
        ref={ref}
        className={cn(
          "[--mark-slider-gap:0.25rem] [--mark-slider-height:0.5rem] [--mark-slider-track-height:0.375rem] [--mark-slider-marker-width:1px]",
          "flex flex-col gap-[--mark-slider-gap] pb-7",
          className,
        )}
        {...props}
      >
        <SnappySliderHeader>
          <SnappySliderLabel
            className={cn(
              kaido &&
                "font-mono text-[10px] uppercase tracking-[0.18em] text-white/55",
            )}
          >
            {label}
          </SnappySliderLabel>
          <SnappySliderValue
            value={inputValue}
            onChange={handleInputChange}
            onBlur={handleInputBlur}
            onKeyDown={handleKeyDown}
            prefix={prefix}
            suffix={suffix}
            numeric={!labelFormatter}
            kaido={kaido}
            className={cn(isOutOfBounds && "opacity-75")}
          />
        </SnappySliderHeader>
        <div className="relative h-[--mark-slider-height]">
          <div ref={sliderRef} className="absolute inset-0">
            <div
              className={cn(
                "absolute top-1/2 -translate-y-1/2 w-full h-[--mark-slider-track-height] rounded-sm overflow-hidden",
                kaido ? "bg-[#d8c69a]/10" : "bg-primary/10",
              )}
            >
              <div
                className={cn("absolute top-0 h-full z-[1]", kaido ? "bg-[#d8c69a]" : "bg-primary")}
                style={{ width: `${sliderPercentage}%` }}
              />

              {sliderValues.map((mark, index) => {
                if (mark === 0) return null;
                const markPercentage = ((mark - sliderMin) / (sliderMax - sliderMin)) * 100;
                if (markPercentage < 0 || markPercentage > 100) return null;
                return (
                  <div
                    key={`${mark}-${index}`}
                    className={cn(
                      "absolute top-0 w-[--mark-slider-marker-width] z-[2] h-full -translate-x-[calc(var(--mark-slider-marker-width)/2)]",
                      "bg-white/90 dark:bg-black/90",
                    )}
                    style={{ left: `${markPercentage}%` }}
                  />
                );
              })}
            </div>

            {sliderValues.includes(0) && (
              <div
                className="absolute top-1/2 -translate-y-1/2 z-20"
                style={{ left: `${((0 - sliderMin) / (sliderMax - sliderMin)) * 100}%` }}
              >
                <div className="h-3 w-[--mark-slider-marker-width] bg-red-600 -translate-x-[calc(var(--mark-slider-marker-width)/2)]" />
              </div>
            )}

            <div
              className={cn(
                "absolute z-30 top-1/2 -translate-y-[35%] -translate-x-1/2 cursor-grab active:cursor-grabbing",
                isOutOfBounds && "opacity-75",
              )}
              style={{ left: `${sliderPercentage}%` }}
            >
              <div
                className={cn(
                  "w-0 h-0 border-[5px] border-transparent mt-2",
                  kaido
                    ? isOutOfBounds
                      ? "border-b-[#d8c69a]/20"
                      : "border-b-[#d8c69a]"
                    : isOutOfBounds
                      ? "border-b-primary/20"
                      : "border-b-primary",
                )}
              />
              <div
                className={cn(
                  "w-[10px] h-[10px]",
                  kaido
                    ? isOutOfBounds
                      ? "bg-[#d8c69a]/20"
                      : "bg-[#d8c69a]"
                    : isOutOfBounds
                      ? "bg-primary/20"
                      : "bg-primary",
                )}
              />
              <div className="absolute top-[22px] left-1/2 -translate-x-1/2 whitespace-nowrap">
                <span
                  className={cn(
                    "text-xs font-medium",
                    kaido && "text-[#f3efe6]",
                    isOutOfBounds && "opacity-75",
                  )}
                >
                  {isOutOfBounds
                    ? currentValue < sliderMin
                      ? `<${formatDisplay(sliderMin)}`
                      : `>${formatDisplay(sliderMax)}`
                    : formatDisplay(currentValue)}
                </span>
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  },
);
SnappySlider.displayName = "SnappySlider";

const SnappySliderHeader = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
  ({ className, ...props }, ref) => (
    <div ref={ref} className={cn("flex justify-between items-center mb-0.5", className)} {...props} />
  ),
);
SnappySliderHeader.displayName = "SnappySliderHeader";

const SnappySliderLabel = React.forwardRef<HTMLLabelElement, React.LabelHTMLAttributes<HTMLLabelElement>>(
  ({ className, ...props }, ref) => (
    <label ref={ref} className={cn("text-xs font-medium text-primary/50", className)} {...props} />
  ),
);
SnappySliderLabel.displayName = "SnappySliderLabel";

const SnappySliderValue = React.forwardRef<
  HTMLInputElement,
  React.InputHTMLAttributes<HTMLInputElement> & {
    prefix?: string;
    suffix?: string;
    numeric?: boolean;
    kaido?: boolean;
  }
>(({ className, prefix, suffix, numeric = true, kaido = false, ...props }, ref) => {
  const inputRef = React.useRef<HTMLInputElement>(null);

  const handleContainerClick = () => {
    inputRef.current?.focus();
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    const input = e.currentTarget;
    const parsed = parseFloat(input.value);

    switch (e.key) {
      case "Enter":
        input.blur();
        break;
      case "ArrowUp":
        e.preventDefault();
        if (!isNaN(parsed)) {
          const step = e.shiftKey ? 10 : 1;
          input.value = String(parsed + step);
          input.dispatchEvent(new Event("change", { bubbles: true }));
        }
        break;
      case "ArrowDown":
        e.preventDefault();
        if (!isNaN(parsed)) {
          const step = e.shiftKey ? 10 : 1;
          input.value = String(parsed - step);
          input.dispatchEvent(new Event("change", { bubbles: true }));
        }
        break;
    }
  };

  return (
    <div
      className={cn(
        "group inline-flex items-center rounded px-0.5 focus-within:ring-1 cursor-text w-20",
        kaido ? "bg-[#d8c69a]/5 focus-within:ring-[#d8c69a]" : "bg-primary/5 focus-within:ring-primary",
      )}
      onClick={handleContainerClick}
    >
      {prefix && (
        <span
          className={cn(
            "text-xs select-none shrink-0",
            kaido ? "text-[#d8c69a]/75" : "text-primary/75",
          )}
        >
          {prefix}
        </span>
      )}
      <input
        ref={(node) => {
          if (typeof ref === "function") ref(node);
          else if (ref) ref.current = node;
          inputRef.current = node;
        }}
        type={numeric ? "number" : "text"}
        inputMode={numeric ? "decimal" : "text"}
        onKeyDown={handleKeyDown}
        className={cn(
          "w-full min-w-0 text-right text-xs bg-transparent border-none focus:outline-none",
          numeric &&
            "[appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none",
          kaido ? "text-[#d8c69a]" : "text-primary",
          className,
        )}
        {...props}
      />
      {suffix && (
        <span
          className={cn(
            "text-xs select-none shrink-0",
            kaido ? "text-[#d8c69a]/75" : "text-primary/75",
          )}
        >
          {suffix}
        </span>
      )}
    </div>
  );
});
SnappySliderValue.displayName = "SnappySliderValue";

export { SnappySlider };
