import React from 'react';
import Select from 'react-select';
import makeAnimated from 'react-select/animated';

const animatedComponents = makeAnimated();

export default function MultiSelect({ options = [], value = [], onChange = () => {} }) {
  // Convert string array to react-select format: { label, value }
  const formattedOptions = options.map((option) => ({
    label: option.replaceAll('_', ' '),
    value: option,
  }));

  // Convert value array to react-select format
  const formattedValue = value.map((v) => ({
    label: v.replaceAll('_', ' '),
    value: v,
  }));

  // Handle change and pass back just the values
  const handleChange = (selected) => {
    const values = selected ? selected.map((item) => item.value) : [];
    onChange(values);
  };

  return (
    <Select
      closeMenuOnSelect={false}
      components={animatedComponents}
      isMulti
      options={formattedOptions}
      value={formattedValue}
      onChange={handleChange}
      placeholder="Select species..."
    />
  );
}