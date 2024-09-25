import { graphic } from 'echarts/core'
import { copy, formatNumber, getShortNumber, getUniqueId } from '../helpers'
import { FIELDTYPES } from '../helpers/constants'
import { column, getFormattedDate } from '../query/helpers'
import useQuery from '../query/query'
import { AxisChartConfig, BarChartConfig, LineChartConfig, SeriesLine } from '../types/chart.types'
import { ColumnDataType, FilterRule, QueryResultColumn, QueryResultRow } from '../types/query.types'
import { Chart } from './chart'
import { getColors } from './colors'

// eslint-disable-next-line no-unused-vars
export function guessChart(columns: QueryResultColumn[], rows: QueryResultRow[]) {
	// categorize the columns into dimensions and measures and then into discrete and continuous
	const dimensions = columns.filter((c) => FIELDTYPES.DIMENSION.includes(c.type))
	const discreteDimensions = dimensions.filter((c) => FIELDTYPES.DISCRETE.includes(c.type))
	const continuousDimensions = dimensions.filter((c) => FIELDTYPES.CONTINUOUS.includes(c.type))

	const measures = columns.filter((c) => FIELDTYPES.MEASURE.includes(c.type))
	const discreteMeasures = measures.filter((c) => FIELDTYPES.DISCRETE.includes(c.type))
	const continuousMeasures = measures.filter((c) => FIELDTYPES.CONTINUOUS.includes(c.type))

	if (measures.length === 1 && dimensions.length === 0) return 'number'
	if (discreteDimensions.length === 1 && measures.length) return 'bar'
	if (continuousDimensions.length === 1 && measures.length) return 'line'
	if (discreteDimensions.length > 1 && measures.length) return 'table'
}

export function getLineChartOptions(chart: Chart) {
	const _config = chart.doc.config as LineChartConfig
	const _columns = chart.dataQuery.result.columns
	const _rows = chart.dataQuery.result.rows

	const number_columns = _columns.filter((c) => FIELDTYPES.NUMBER.includes(c.type))
	const show_legend = number_columns.length > 1

	const xAxis = getXAxis({ column_type: _config.x_axis.data_type })
	const xAxisIsDate = FIELDTYPES.DATE.includes(_config.x_axis.data_type)
	const granularity = xAxisIsDate ? chart.getGranularity(_config.x_axis.column_name) : null

	const leftYAxis = getYAxis()
	const rightYAxis = getYAxis()
	const hasRightAxis = _config.y_axis.series.some((s) => s.align === 'Right')
	const yAxis = !hasRightAxis ? [leftYAxis] : [leftYAxis, rightYAxis]

	const sortedRows = xAxisIsDate
		? _rows.sort((a, b) => {
				const a_date = new Date(a[_config.x_axis.column_name])
				const b_date = new Date(b[_config.x_axis.column_name])
				return a_date.getTime() - b_date.getTime()
		  })
		: _rows

	const getSeriesData = (column: string) =>
		sortedRows.map((r) => {
			const x_value = r[_config.x_axis.column_name]
			const y_value = r[column]
			return [x_value, y_value]
		})

	const colors = getColors()

	return {
		animation: true,
		animationDuration: 700,
		grid: getGrid({ show_legend }),
		color: colors,
		xAxis,
		yAxis,
		series: number_columns.map((c, idx) => {
			const serie = getSerie(_config, c.name) as SeriesLine

			const is_right_axis = serie.align === 'Right'
			const smooth = serie.smooth ?? _config.y_axis.smooth
			const show_data_points = serie.show_data_points ?? _config.y_axis.show_data_points
			const show_area = serie.show_area ?? _config.y_axis.show_area
			const show_data_labels = serie.show_data_labels ?? _config.y_axis.show_data_labels

			return {
				type: 'line',
				name: c.name,
				data: getSeriesData(c.name),
				emphasis: { focus: 'series' },
				yAxisIndex: is_right_axis ? 1 : 0,
				smooth: smooth ? 0.4 : false,
				smoothMonotone: 'x',
				showSymbol: show_data_points || show_data_labels,
				label: {
					fontSize: 11,
					show: show_data_labels,
					position: idx === number_columns.length - 1 ? 'top' : 'inside',
					formatter: (params: any) => {
						return getShortNumber(params.value?.[1], 1)
					},
				},
				labelLayout: { hideOverlap: true },
				itemStyle: { color: colors[idx] },
				areaStyle: show_area ? getAreaStyle(colors[idx]) : undefined,
			}
		}),
		tooltip: getTooltip({
			xAxisIsDate,
			granularity,
		}),
		legend: getLegend(show_legend),
	}
}

function getAreaStyle(color: string) {
	return {
		color: new graphic.LinearGradient(0, 0, 0, 1, [
			{ offset: 0, color: color },
			{ offset: 1, color: '#fff' },
		]),
		opacity: 0.2,
	}
}

export function getBarChartOptions(chart: Chart) {
	const _config = chart.doc.config as BarChartConfig
	const _columns = chart.dataQuery.result.columns
	const _rows = chart.dataQuery.result.rows

	const number_columns = _columns.filter((c) => FIELDTYPES.NUMBER.includes(c.type))
	const total_per_x_value = _rows.reduce((acc, row) => {
		const x_value = row[_config.x_axis.column_name]
		if (!acc[x_value]) acc[x_value] = 0
		number_columns.forEach((m) => (acc[x_value] += row[m.name]))
		return acc
	}, {} as Record<string, number>)

	const show_legend = number_columns.length > 1

	const xAxis = getXAxis({ column_type: _config.x_axis.data_type })
	const xAxisIsDate = FIELDTYPES.DATE.includes(_config.x_axis.data_type)
	const granularity = xAxisIsDate ? chart.getGranularity(_config.x_axis.column_name) : null

	const leftYAxis = getYAxis({ normalized: _config.y_axis.normalize })
	const rightYAxis = getYAxis({ normalized: _config.y_axis.normalize })
	const hasRightAxis = _config.y_axis.series.some((s) => s.align === 'Right')
	const yAxis = !hasRightAxis ? [leftYAxis] : [leftYAxis, rightYAxis]

	const getSeriesData = (column: string) =>
		_rows.map((r) => {
			const x_value = r[_config.x_axis.column_name]
			const y_value = r[column]
			const normalize = _config.y_axis.normalize
			if (!normalize) {
				return [x_value, y_value]
			}

			const total = total_per_x_value[x_value]
			const normalized_value = total ? (y_value / total) * 100 : 0
			return [x_value, normalized_value]
		})

	const colors = getColors()

	return {
		animation: true,
		animationDuration: 700,
		color: colors,
		grid: getGrid({ show_legend }),
		xAxis: xAxis,
		yAxis: yAxis,
		series: number_columns.map((c, idx) => {
			const serie = getSerie(_config, c.name)
			const is_right_axis = serie.align === 'Right'

			const stack = _config.y_axis.stack
			const show_data_labels = serie.show_data_labels ?? _config.y_axis.show_data_labels

			return {
				type: 'bar',
				stack,
				name: c.name,
				data: getSeriesData(c.name),
				label: {
					show: show_data_labels,
					position: idx === number_columns.length - 1 ? 'top' : 'inside',
					formatter: (params: any) => {
						return getShortNumber(params.value?.[1], 1)
					},
					fontSize: 11,
				},
				labelLayout: { hideOverlap: true },
				emphasis: { focus: 'series' },
				barMaxWidth: 60,
				yAxisIndex: is_right_axis ? 1 : 0,
				itemStyle: { color: colors[idx] },
			}
		}),
		tooltip: getTooltip({
			xAxisIsDate,
			granularity,
		}),
		legend: getLegend(show_legend),
	}
}

function getSerie(config: AxisChartConfig, number_column: string) {
	let serie
	if (!config.split_by?.column_name) {
		serie = config.y_axis.series.find((s) => s.measure.measure_name === number_column)
	} else {
		let seriesCount = config.y_axis.series.filter((s) => s.measure.measure_name).length
		if (seriesCount === 1) {
			serie = config.y_axis.series[0]
		} else {
			serie = config.y_axis.series.find((s) => number_column.includes(s.measure.measure_name))
		}
	}
	serie = serie || config.y_axis.series[0]
	return serie
}

type XAxisCustomizeOptions = {
	column_type?: ColumnDataType
}
function getXAxis(options: XAxisCustomizeOptions = {}) {
	const xAxisIsDate = options.column_type && FIELDTYPES.DATE.includes(options.column_type)
	return {
		type: xAxisIsDate ? 'time' : 'category',
		z: 2,
		scale: true,
		boundaryGap: ['1%', '2%'],
		splitLine: { show: false },
		axisLine: { show: true },
		axisTick: { show: false },
	}
}

type YAxisCustomizeOptions = {
	is_secondary?: boolean
	normalized?: boolean
}
function getYAxis(options: YAxisCustomizeOptions = {}) {
	return {
		show: true,
		type: 'value',
		z: 2,
		scale: false,
		alignTicks: true,
		boundaryGap: ['0%', '1%'],
		splitLine: { show: true },
		axisTick: { show: false },
		axisLine: { show: false, onZero: false },
		axisLabel: {
			show: true,
			hideOverlap: true,
			margin: 4,
			formatter: (value: number) => getShortNumber(value, 1),
		},
		min: options.normalized ? 0 : undefined,
		max: options.normalized ? 100 : undefined,
	}
}

export function getDonutChartOptions(columns: QueryResultColumn[], rows: QueryResultRow[]) {
	const MAX_SLICES = 10
	const data = getDonutChartData(columns, rows, MAX_SLICES)

	const colors = getColors()
	return {
		animation: true,
		animationDuration: 700,
		color: colors,
		dataset: { source: data },
		series: [
			{
				type: 'pie',
				center: ['50%', '45%'],
				radius: ['40%', '70%'],
				labelLine: { show: false },
				label: { show: false },
				emphasis: {
					scaleSize: 5,
				},
			},
		],
		legend: getLegend(),
		tooltip: {
			...getTooltip(),
			trigger: 'item',
		},
	}
}

function getDonutChartData(
	columns: QueryResultColumn[],
	rows: QueryResultRow[],
	maxSlices: number
) {
	// reduce the number of slices to 10
	const measureColumn = columns.find((c) => FIELDTYPES.MEASURE.includes(c.type))
	if (!measureColumn) {
		throw new Error('No measure column found')
	}

	const labelColumn = columns.find((c) => FIELDTYPES.DIMENSION.includes(c.type))
	if (!labelColumn) {
		throw new Error('No label column found')
	}

	const valueByLabel = rows.reduce((acc, row) => {
		const label = row[labelColumn.name]
		const value = row[measureColumn.name]
		if (!acc[label]) acc[label] = 0
		acc[label] = acc[label] + value
		return acc
	}, {} as Record<string, number>)

	const sortedLabels = Object.keys(valueByLabel).sort((a, b) => valueByLabel[b] - valueByLabel[a])
	const topLabels = sortedLabels.slice(0, maxSlices)
	const others = sortedLabels.slice(maxSlices)
	const topData = topLabels.map((label) => [label, valueByLabel[label]])
	const othersTotal = others.reduce((acc, label) => acc + valueByLabel[label], 0)

	if (othersTotal) {
		topData.push(['Others', othersTotal])
	}

	return topData
}

function getGrid(options: any = {}) {
	return {
		top: 18,
		left: 30,
		right: 30,
		bottom: options.show_legend ? 36 : 22,
		containLabel: true,
	}
}

function getTooltip(options: any = {}) {
	return {
		trigger: 'axis',
		confine: true,
		appendToBody: false,
		formatter: (params: Object | Array<Object>) => {
			if (!Array.isArray(params)) {
				const p = params as any
				const value = p.value[1]
				const formatted = isNaN(value) ? value : formatNumber(value)
				return `
					<div class="flex items-center justify-between gap-5">
						<div>${p.name}</div>
						<div class="font-bold">${formatted}</div>
					</div>
				`
			}
			if (Array.isArray(params)) {
				const t = params.map((p, idx) => {
					const xValue = p.value[0]
					const yValue = p.value[1]
					const formattedX =
						options.xAxisIsDate && options.granularity
							? getFormattedDate(xValue, options.granularity)
							: xValue
					const formattedY = isNaN(yValue) ? yValue : formatNumber(yValue)
					return `
							<div class="flex flex-col">
								${idx == 0 ? `<div>${formattedX}</div>` : ''}
								<div class="flex items-center justify-between gap-5">
									<div class="flex gap-1 items-center">
										${p.marker}
										<div>${p.seriesName}</div>
									</div>
									<div class="font-bold">${formattedY}</div>
								</div>
							</div>
						`
				})
				return t.join('')
			}
		},
	}
}

function getLegend(show_legend = true) {
	return {
		show: show_legend,
		icon: 'circle',
		type: 'scroll',
		orient: 'horizontal',
		bottom: 'bottom',
		itemGap: 16,
		padding: [10, 30],
		textStyle: { padding: [0, 0, 0, -4] },
		pageIconSize: 10,
		pageIconColor: '#64748B',
		pageIconInactiveColor: '#C0CCDA',
		pageFormatter: '{current}',
		pageButtonItemGap: 2,
	}
}

export function getDrillDownQuery(chart: Chart, row: QueryResultRow, col: QueryResultColumn) {
	if (!FIELDTYPES.NUMBER.includes(col.type)) {
		return
	}

	const textColumns = chart.dataQuery.result.columns
		.filter((column) => FIELDTYPES.TEXT.includes(column.type))
		.map((column) => column.name)

	const dateColumns = chart.dataQuery.result.columns
		.filter((column) => FIELDTYPES.DATE.includes(column.type))
		.map((column) => column.name)

	const rowIndex = chart.dataQuery.result.formattedRows.findIndex((r) => r === row)
	const currRow = chart.dataQuery.result.rows[rowIndex]
	const nextRow = chart.dataQuery.result.rows[rowIndex + 1]

	const filters: FilterRule[] = []
	for (const column_name of textColumns) {
		filters.push({
			column: column(column_name),
			operator: '=',
			value: currRow[column_name] as string,
		})
	}

	for (const column_name of dateColumns) {
		if (nextRow) {
			filters.push({
				column: column(column_name),
				operator: '>=',
				value: currRow[column_name] as string,
			})
			filters.push({
				column: column(column_name),
				operator: '<',
				value: nextRow[column_name] as string,
			})
		} else {
			filters.push({
				column: column(column_name),
				operator: '>=',
				value: currRow[column_name] as string,
			})
		}
	}

	const query = useQuery({ name: getUniqueId(), operations: [] })
	query.autoExecute = false

	query.setOperations(copy(chart.dataQuery.doc.operations))
	const summarizeIndex = query.doc.operations.findIndex((op) => op.type === 'summarize')
	query.doc.operations.splice(summarizeIndex)

	query.addFilterGroup({
		logical_operator: 'And',
		filters: filters,
	})

	return query
}

export function handleOldYAxisConfig(old_y_axis: any): AxisChartConfig['y_axis'] {
	if (Array.isArray(old_y_axis)) {
		return {
			series: old_y_axis.map((measure: any) => ({ measure })),
		}
	}
	return old_y_axis
}
