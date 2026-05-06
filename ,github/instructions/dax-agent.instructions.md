# DAX Agent Instructions

**Trigger**: Any task involving DAX measures, calculated columns, calculated tables, KPIs, Power BI report logic, Analysis Services models, or files in `powerbi/**`, `*.pbix`, `*.bim`, or `*.dax`.

---

## Your Role

You write correct, performant, and readable DAX. You always consider context transition, filter propagation, and evaluation order before generating a measure. You never write DAX that works accidentally — you understand *why* it works.

---

## Measure vs Calculated Column — Decide First

Before writing anything, determine which construct is needed:

| Use a **Measure** when… | Use a **Calculated Column** when… |
|---|---|
| The value aggregates rows (SUM, COUNT, AVERAGE…) | You need a per-row value stored in the table |
| The value changes with filter context (slicers, visuals) | The value is static after refresh |
| Used in visuals, cards, KPIs | Used as a slicer, relationship key, or row-level filter |
| Performance matters at report load time | Row count is manageable (<10M rows) |

**Default to measures.** Calculated columns consume RAM on refresh and don't respond to filter context.

---

## Measure Anatomy

```dax
-- ✅ Correct structure
Revenue :=
VAR _FilteredSales =
    CALCULATETABLE(
        Sales,
        Sales[Status] = "Completed"
    )
VAR _Result =
    SUMX( _FilteredSales, Sales[Quantity] * Sales[UnitPrice] )
RETURN
    IF( ISBLANK( _Result ), 0, _Result )
```

Rules for every measure:
- Use `VAR` / `RETURN` for any measure with more than one logical step
- Name variables with a leading underscore: `_FilteredSales`, `_Result`
- Explicitly handle `BLANK()` — decide whether to return 0 or BLANK intentionally
- Add a comment block above complex measures (see Documentation section)

---

## Filter Context vs Row Context

This is the most common source of DAX bugs. Internalize these rules:

### Row Context (calculated columns, SUMX iterators)
```dax
-- Row context exists here — each row is evaluated individually
Margin Column = Sales[Revenue] - Sales[Cost]   -- valid in calculated column

-- Row context does NOT automatically filter — use RELATED() to cross tables
Category = RELATED( Products[Category] )
```

### Filter Context (measures in visuals)
```dax
-- Filter context is imposed by the visual, slicers, and CALCULATE
Revenue :=
    SUM( Sales[Amount] )   -- SUM respects whatever filters the visual applies
```

### Context Transition (the tricky one)
```dax
-- CALCULATE inside an iterator converts row context → filter context
Revenue by Customer :=
    SUMX(
        Customers,
        CALCULATE( SUM( Sales[Amount] ) )
        -- CALCULATE here creates a filter context from each Customer row
        -- This is context transition — intentional and correct here
    )
```

---

## CALCULATE — The Most Important Function

```dax
-- CALCULATE( <expression>, <filter1>, <filter2>, ... )
-- It does two things:
-- 1. Evaluates <expression> in a MODIFIED filter context
-- 2. Any existing filters on the same column are REPLACED (not added to) by default

-- ✅ Filter replacement (default)
Revenue YTD :=
    CALCULATE(
        [Revenue],
        DATESYTD( 'Date'[Date] )   -- replaces any existing date filter
    )

-- ✅ Adding a filter without removing existing ones — use KEEPFILTERS
Revenue Completed :=
    CALCULATE(
        [Revenue],
        KEEPFILTERS( Sales[Status] = "Completed" )
    )

-- ✅ Removing all filters from a column — ALL()
Revenue All Regions :=
    CALCULATE(
        [Revenue],
        ALL( Geography[Region] )
    )

-- ✅ Removing all filters from the entire table
Revenue All :=
    CALCULATE( [Revenue], ALL( Sales ) )
```

---

## Time Intelligence Patterns

Always verify a **Date table is marked as Date table** in the model before using time intelligence functions.

```dax
-- Year-to-date
Revenue YTD :=
    CALCULATE( [Revenue], DATESYTD( 'Date'[Date] ) )

-- Same period last year
Revenue SPLY :=
    CALCULATE( [Revenue], SAMEPERIODLASTYEAR( 'Date'[Date] ) )

-- Rolling 12 months
Revenue R12M :=
    CALCULATE(
        [Revenue],
        DATESINPERIOD( 'Date'[Date], LASTDATE( 'Date'[Date] ), -12, MONTH )
    )

-- Month-over-month % change
Revenue MoM % :=
VAR _CurrentMonth = [Revenue]
VAR _PrevMonth =
    CALCULATE( [Revenue], DATEADD( 'Date'[Date], -1, MONTH ) )
RETURN
    DIVIDE( _CurrentMonth - _PrevMonth, _PrevMonth )
    -- Use DIVIDE() always — never divide with / operator (division by zero risk)
```

---

## DIVIDE() — Always Use It

```dax
-- ❌ Never do this
Margin % = [Gross Profit] / [Revenue]   -- crashes on division by zero

-- ✅ Always do this
Margin % :=
    DIVIDE( [Gross Profit], [Revenue] )            -- returns BLANK on zero denominator

-- ✅ With explicit alternate result
Margin % :=
    DIVIDE( [Gross Profit], [Revenue], 0 )         -- returns 0 on zero denominator
```

---

## BLANK() Handling

```dax
-- Know when to return BLANK vs 0 — they behave differently in visuals
-- BLANK: the cell shows empty, won't plot on line charts (gap)
-- 0: the cell shows 0, will plot on line charts (flat line)

-- ✅ Explicit BLANK handling
Units Sold :=
VAR _Result = SUM( Sales[Quantity] )
RETURN
    IF( ISBLANK( _Result ), BLANK(), _Result )
    -- or simply: _Result  (SUM already returns BLANK when no rows)

-- ✅ Force 0 when BLANK would mislead
Conversion Rate :=
    DIVIDE( [Orders], [Sessions], 0 )   -- 0 is correct here, not BLANK
```

---

## Iterator Functions (X-functions)

Use iterators when you need row-by-row evaluation before aggregating:

```dax
-- ✅ SUMX — multiply then sum (not sum then multiply)
Revenue :=
    SUMX( Sales, Sales[Quantity] * Sales[UnitPrice] )

-- ✅ AVERAGEX — weighted average
Avg Unit Price :=
    DIVIDE( [Revenue], SUM( Sales[Quantity] ) )
    -- Prefer this over AVERAGEX( Sales, Sales[UnitPrice] ) which gives simple average

-- ✅ RANKX — ranking within filter context
Sales Rank :=
    RANKX(
        ALL( Products[ProductName] ),   -- rank across all products, ignoring visual filter
        [Revenue],                       -- the expression to rank by
        ,                                -- omit for default (same as [Revenue])
        DESC,                            -- descending
        Dense                            -- Dense = no gaps in rank numbers
    )

-- ✅ MAXX / MINX — find max of an expression across rows
Latest Order Date :=
    MAXX( Sales, Sales[OrderDate] )
```

---

## Variables — Always Use for Readability and Performance

```dax
-- ❌ Avoid: expression evaluated multiple times, unreadable
Bad Measure :=
    IF(
        DIVIDE( SUM(Sales[Amount]), CALCULATE( SUM(Sales[Amount]), ALL(Sales) ) ) > 0.1,
        DIVIDE( SUM(Sales[Amount]), CALCULATE( SUM(Sales[Amount]), ALL(Sales) ) ),
        0
    )

-- ✅ Correct: each expression evaluated once, readable
Good Measure :=
VAR _Revenue = SUM( Sales[Amount] )
VAR _TotalRevenue = CALCULATE( SUM( Sales[Amount] ), ALL( Sales ) )
VAR _Share = DIVIDE( _Revenue, _TotalRevenue )
RETURN
    IF( _Share > 0.1, _Share, 0 )
```

---

## Performance Rules

| Rule | Why |
|---|---|
| Prefer `SUM` over `SUMX` when no row-by-row math is needed | SUMX iterates in row context — more expensive |
| Avoid `FILTER( ALL( Table ), ... )` on large tables | Full table scan — use column-level filters instead |
| Use `SELECTEDVALUE()` instead of `VALUES()` + `HASONEVALUE()` | Cleaner and handles multi-select automatically |
| Avoid calculated columns that replicate measure logic | Wastes RAM; use measures in visuals instead |
| Never nest `CALCULATE` inside `FILTER` on large tables | Creates a context transition per row — very slow |
| Use `TREATAS` instead of `FILTER` to apply virtual relationships | Column-level filtering is faster than table scanning |

```dax
-- ❌ Slow — full table scan with context transition per row
Slow :=
    CALCULATE(
        [Revenue],
        FILTER( ALL( Sales ), Sales[Region] = SELECTEDVALUE( Regions[Region] ) )
    )

-- ✅ Fast — column-level filter
Fast :=
    CALCULATE(
        [Revenue],
        Sales[Region] = SELECTEDVALUE( Regions[Region] )
    )
```

---

## Naming Conventions

```
[Revenue]                    -- base measures: noun or noun phrase, Title Case
[Revenue YTD]                -- time intelligence suffix: space + abbreviation
[Revenue SPLY]
[Revenue MoM %]              -- % suffix for ratios shown as percentage
[Revenue vs Budget]          -- comparison measures: vs keyword
[# Orders]                   -- count measures: # prefix
[Avg Order Value]            -- averages: Avg prefix
[Is High Value Customer]     -- boolean: Is / Has prefix
```

- Measure names go in square brackets when referenced: `[Revenue]`
- Table names go unbracketed unless they contain spaces: `Sales`, `'Product Category'`
- Column references always qualify the table: `Sales[Amount]`, never just `[Amount]`

---

## Documentation Standard

Add a comment block above every non-trivial measure:

```dax
/*
 * Revenue YTD
 * -----------
 * Year-to-date revenue from completed sales, resetting on Jan 1.
 * Depends on: [Revenue], Date table marked as Date table
 * Filter context: Responds to Year, Month slicers. Ignores Day-level filters.
 * Returns: Currency (same unit as [Revenue])
 */
Revenue YTD :=
    CALCULATE( [Revenue], DATESYTD( 'Date'[Date] ) )
```

---

## Common Patterns — Reference Implementations

### Market Share
```dax
Market Share % :=
VAR _Current = [Revenue]
VAR _Total = CALCULATE( [Revenue], ALL( Products[Category] ) )
RETURN
    DIVIDE( _Current, _Total )
```

### Running Total
```dax
Revenue Running Total :=
    CALCULATE(
        [Revenue],
        FILTER(
            ALL( 'Date'[Date] ),
            'Date'[Date] <= MAX( 'Date'[Date] )
        )
    )
```

### Dynamic Top N
```dax
Top N Revenue :=
VAR _N = SELECTEDVALUE( TopN[N], 10 )    -- TopN is a disconnected parameter table
VAR _TopProducts =
    TOPN( _N, ALL( Products[ProductName] ), [Revenue], DESC )
RETURN
    CALCULATE( [Revenue], _TopProducts )
```

### Switch for Dynamic Measure Selection
```dax
Selected Metric :=
VAR _Selection = SELECTEDVALUE( MetricSelector[Metric], "Revenue" )
RETURN
    SWITCH(
        _Selection,
        "Revenue",      [Revenue],
        "Units",        [Units Sold],
        "Margin",       [Gross Margin %],
        BLANK()
    )
```

---

## Do Not

- ❌ Use `/` for division — always use `DIVIDE()`
- ❌ Reference `[ColumnName]` without the table prefix in measures — always `Table[Column]`
- ❌ Use `FILTER( Table, ... )` where a simple column filter works
- ❌ Write measures longer than ~20 lines without `VAR` decomposition
- ❌ Use `IF( ISBLANK(x), 0, x )` — just use `DIVIDE()` or `+0` where 0 is the correct default
- ❌ Create calculated columns that duplicate measure logic
- ❌ Nest time intelligence functions (e.g., `DATESYTD` inside `SAMEPERIODLASTYEAR`) — they conflict
- ❌ Assume a Date table exists — verify it is marked as Date table and has no gaps
