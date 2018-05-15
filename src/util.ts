export function shallowCopy(value: any) {
  if (value == null) {
    return value;
  }

  if (Array.isArray(value)) {
    return value.slice(0);
  } else if (typeof value === 'object') {
    return {...value};
  } else {
    return value;
  }
}