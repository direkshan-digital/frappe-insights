<script setup lang="ts">
import { computed, inject } from 'vue'
import DashboardBuilder from '../dashboard/DashboardBuilder.vue'
import { workbookKey } from './workbook'

const props = defineProps<{ name?: string; index: number | string }>()

const workbook = inject(workbookKey)
const activeDashboard = computed(() => workbook?.doc.dashboards[Number(props.index)])
</script>

<template>
	<DashboardBuilder
		v-if="workbook && activeDashboard"
		:key="activeDashboard.name"
		:dashboard="activeDashboard"
		:charts="workbook.doc.charts"
		:queries="workbook.doc.queries"
	/>
</template>
