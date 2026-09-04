<script lang="ts">
    import SettingsSection from '../components/SettingsSection.svelte'
    import { tString } from '$lib/intl/messages.svelte'
    import SettingRow from '../components/SettingRow.svelte'
    import SettingToggleGroup from '../components/SettingToggleGroup.svelte'
    import { getSetting, getSettingDefinition, onSpecificSettingChange, type TabBarPosition } from '$lib/settings'
    import { createShouldShow } from '$lib/settings/settings-search'
    import { onMount } from 'svelte'

    interface Props {
        searchQuery: string
    }

    const { searchQuery }: Props = $props()

    const shouldShow = $derived(createShouldShow(searchQuery))

    const positionDef = getSettingDefinition('appearance.tabBarPosition') ?? { label: '', description: '' }
    const placementDef = getSettingDefinition('appearance.sideTabPlacement') ?? { label: '', description: '' }

    // Read the setting directly and subscribe in-window. `reactive-settings.svelte.ts` is only
    // initialised in the main window; the settings window has its own JS context where that
    // module-scope state never updates, so we can't rely on its getter here.
    let tabBarPosition = $state<TabBarPosition>(getSetting('appearance.tabBarPosition'))
    onMount(() =>
        onSpecificSettingChange('appearance.tabBarPosition', (value) => {
            tabBarPosition = value
        }),
    )
    // Placement only matters for side tabs, so it greys out while the bar is on top.
    const placementDisabled = $derived(tabBarPosition !== 'side')
</script>

<SettingsSection title={tString('settings.section.tabs')}>
    {#if shouldShow('appearance.tabBarPosition')}
        <SettingRow
            id="appearance.tabBarPosition"
            label={positionDef.label}
            description={positionDef.description}
            {searchQuery}
        >
            <SettingToggleGroup id="appearance.tabBarPosition" />
        </SettingRow>
    {/if}
    {#if shouldShow('appearance.sideTabPlacement')}
        <SettingRow
            id="appearance.sideTabPlacement"
            label={placementDef.label}
            description={placementDef.description}
            {searchQuery}
        >
            <SettingToggleGroup id="appearance.sideTabPlacement" disabled={placementDisabled} />
        </SettingRow>
    {/if}
</SettingsSection>
