import test from 'node:test';
import assert from 'node:assert/strict';
import { readGridMeasurements } from './visual-measure.ts';

test('ECG grid estimates use the stated speed and preserve the count and lead', () => {
  const grid = {gridVisible:true,speedMmPerSec:25,speedEvidence:'25 mm/s',spans:[
    {metric:'RR',smallSquares:20,lead:'II',basis:'Between two visible R peaks'},
    {metric:'QRS',smallSquares:2,lead:'V5',basis:'Visible QRS onset and offset'},
  ]};
  assert.deepEqual(readGridMeasurements(grid).map(item => [item.metric,item.value,item.unit]), [['RR',800,'ms'],['HR',75,'bpm'],['QRS',80,'ms']]);
  assert.equal(readGridMeasurements({...grid,speedMmPerSec:50,speedEvidence:'50 мм/с'})[1].value,150);
  assert.deepEqual(readGridMeasurements({...grid,speedEvidence:'speed not visible'}),[]);
  assert.deepEqual(readGridMeasurements({...grid,speedEvidence:'125 mm/s'}),[]);
  assert.deepEqual(readGridMeasurements({...grid,gridVisible:false}),[]);
});
