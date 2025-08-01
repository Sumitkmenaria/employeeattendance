import React, { useState, useMemo, useEffect } from 'react';
import { EmployeeData, AttendanceRecord, Stat, RecordUpdatePayload, Holiday } from '../types';
import { STATUS_COLORS } from '../constants';
import { EditIcon, MagicIcon, ExcelIcon, ExclamationTriangleIcon } from './icons/Icon';
import { generateSummaryStats, exportToExcel } from '../services/reportService';
import EditRecordModal from './EditRecordModal';
import HolidayManager from './HolidayManager';
import AllEmployeesSummary from './AllEmployeesSummary';

interface ReportViewProps {
  data: EmployeeData[];
  onRecordUpdate: (payload: RecordUpdatePayload) => void;
  onHolidaysUpdate: (holidays: Holiday[]) => void;
  holidays: Holiday[];
}

const StatCard: React.FC<{ stat: Stat }> = ({ stat }) => (
    <div className={`${stat.color} p-4 rounded-lg shadow-md text-white transition-transform hover:scale-105`}>
        <p className="text-3xl font-bold">{stat.value}</p>
        <p className="text-sm font-medium opacity-90">{stat.label}</p>
    </div>
);


const ReportView: React.FC<ReportViewProps> = ({ data, onRecordUpdate, onHolidaysUpdate, holidays }) => {
    const [selectedEmployee, setSelectedEmployee] = useState<string>('All');
    const [editingRecord, setEditingRecord] = useState<AttendanceRecord | null>(null);
    const [isHolidayManagerOpen, setIsHolidayManagerOpen] = useState(false);

    const fullDateRange = useMemo(() => {
        const allDates = data?.flatMap(e => e.records.map(r => new Date(r.date).getTime())).filter(t => !isNaN(t));

        if (!allDates || allDates.length === 0) {
            const now = new Date();
            return { start: now, end: now };
        }
        
        const min = new Date(Math.min(...allDates));
        const max = new Date(Math.max(...allDates));
        return { start: min, end: max };
    }, [data]);
    
    const [filterStartDate, setFilterStartDate] = useState(fullDateRange.start);
    const [filterEndDate, setFilterEndDate] = useState(fullDateRange.end);

    useEffect(() => {
        setFilterStartDate(fullDateRange.start);
        setFilterEndDate(fullDateRange.end);
    }, [fullDateRange]);
    
    const filteredData = useMemo(() => {
        if (!filterStartDate || isNaN(filterStartDate.getTime()) || !filterEndDate || isNaN(filterEndDate.getTime())) return [];

        const start = new Date(filterStartDate);
        start.setHours(0, 0, 0, 0);
        const startTime = start.getTime();

        const end = new Date(filterEndDate);
        end.setHours(0, 0, 0, 0);
        const endTime = end.getTime();
        
        return data
            .map(emp => {
                const records = emp.records.filter(rec => {
                    const recTime = new Date(rec.date).setHours(0, 0, 0, 0);
                    return recTime >= startTime && recTime <= endTime;
                });
                return { ...emp, records };
            })
            .filter(emp => selectedEmployee === 'All' || emp.employeeName === selectedEmployee);
    }, [data, selectedEmployee, filterStartDate, filterEndDate]);

    const recordsToShow = useMemo(() => {
       if (selectedEmployee === 'All') {
           return filteredData.flatMap(e => e.records).sort((a,b) => {
               const dateComp = new Date(b.date).getTime() - new Date(a.date).getTime();
               if (dateComp !== 0) return dateComp;
               return a.name.localeCompare(b.name);
            });
       }
       const emp = filteredData.find(e => e.employeeName === selectedEmployee);
       return emp ? [...emp.records].sort((a,b) => new Date(b.date).getTime() - new Date(a.date).getTime()) : [];
    }, [filteredData, selectedEmployee]);

    const summaryStats = useMemo(() => {
        if (selectedEmployee === 'All') return [];
        return generateSummaryStats(recordsToShow);
    }, [recordsToShow, selectedEmployee]);

    const handleExport = () => {
      if (selectedEmployee === 'All') {
        alert("Please select a specific employee to export their report.");
        return;
      }
      exportToExcel(recordsToShow, summaryStats, selectedEmployee, {start: filterStartDate, end: filterEndDate});
    };
    
    const dateToInputValue = (date: Date) => {
      if (date && !isNaN(date.getTime())) {
        return date.toISOString().split('T')[0];
      }
      return '';
    };

    return (
        <div className="w-full max-w-7xl mx-auto animate-fade-in space-y-6">
            <div className="bg-white p-4 rounded-lg shadow-md">
                <h2 className="text-xl font-bold mb-4">Report Filters</h2>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4 items-end">
                    <div>
                        <label htmlFor="employee-select" className="block text-sm font-medium text-slate-700">Employee</label>
                        <select id="employee-select" value={selectedEmployee} onChange={e => setSelectedEmployee(e.target.value)} className="mt-1 block w-full pl-3 pr-10 py-2 text-base border-gray-300 focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm rounded-md">
                            <option>All</option>
                            {data.map(emp => <option key={emp.employeeName}>{emp.employeeName}</option>)}
                        </select>
                    </div>
                    <div>
                        <label htmlFor="start-date" className="block text-sm font-medium text-slate-700">Start Date</label>
                        <input type="date" id="start-date" value={dateToInputValue(filterStartDate)} onChange={e => setFilterStartDate(new Date(e.target.value))} min={dateToInputValue(fullDateRange.start)} max={dateToInputValue(fullDateRange.end)} className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm"/>
                    </div>
                    <div>
                        <label htmlFor="end-date" className="block text-sm font-medium text-slate-700">End Date</label>
                        <input type="date" id="end-date" value={dateToInputValue(filterEndDate)} onChange={e => setFilterEndDate(new Date(e.target.value))} min={dateToInputValue(fullDateRange.start)} max={dateToInputValue(fullDateRange.end)} className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm"/>
                    </div>
                </div>
                <div className="mt-4 flex flex-wrap gap-4 justify-between items-center">
                   <button onClick={() => setIsHolidayManagerOpen(true)} className="px-4 py-2 text-sm font-medium rounded-md text-slate-700 bg-slate-200 hover:bg-slate-300">
                        Manage Holidays
                    </button>
                    <button
                      onClick={handleExport}
                      disabled={selectedEmployee === 'All'}
                      className="inline-flex items-center gap-2 px-4 py-2 border border-transparent text-sm font-medium rounded-md shadow-sm text-white bg-green-600 hover:bg-green-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-green-500 disabled:bg-slate-300 disabled:cursor-not-allowed"
                     >
                      <ExcelIcon/>
                      Export Report
                    </button>
                </div>
            </div>

            {selectedEmployee === 'All' ? (
                <AllEmployeesSummary data={filteredData} />
            ) : (
                <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
                    {summaryStats.map(stat => <StatCard key={stat.label} stat={stat} />)}
                </div>
            )}
            
            <div className="bg-white p-4 rounded-lg shadow-md overflow-x-auto">
              <table className="min-w-full divide-y divide-slate-200">
                <thead className="bg-slate-50">
                  <tr>
                    <th className="px-4 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">Date</th>
                    {selectedEmployee === 'All' && <th className="px-4 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">Name</th>}
                    <th className="px-4 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">Status</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">In/Out Time</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">Total Hours</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">Reason / Note</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">Actions</th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-slate-200">
                    {recordsToShow.map(record => {
                        const missedPunch = (record.inTime && !record.outTime) || (!record.inTime && record.outTime && record.workHoursDecimal > 0);
                        return (
                        <tr key={record.id} className={STATUS_COLORS[record.status].split(' ')[0]}>
                            <td className="px-4 py-3 whitespace-nowrap text-sm">
                              <div className="font-medium text-slate-900">{new Date(record.date).toLocaleDateString()}</div>
                              <div className="text-slate-500">{new Date(record.date).toLocaleDateString('en-US', { weekday: 'short' })}</div>
                            </td>
                            {selectedEmployee === 'All' && <td className="px-4 py-3 whitespace-nowrap text-sm text-slate-600">{record.name}</td>}
                            <td className="px-4 py-3 whitespace-nowrap text-sm">
                                <span className={`px-2 inline-flex text-xs leading-5 font-semibold rounded-full ${STATUS_COLORS[record.status]}`}>
                                    {record.status}
                                </span>
                            </td>
                            <td className={`px-4 py-3 whitespace-nowrap text-sm text-slate-500 ${missedPunch ? 'bg-orange-100' : ''}`}>
                                {missedPunch && <ExclamationTriangleIcon />}
                                {record.inTime || '--:--'} / {record.outTime || '--:--'}
                            </td>
                            <td className="px-4 py-3 whitespace-nowrap text-sm font-semibold text-slate-700">{record.totalHours || '0:00'}</td>
                            <td className="px-4 py-3 text-sm text-slate-600 max-w-xs">
                                {record.isAiEnhanced && <MagicIcon/>} <span className="truncate">{record.reason}</span>
                            </td>
                            <td className="px-4 py-3 whitespace-nowrap text-sm">
                                <button onClick={() => setEditingRecord(record)} className="text-indigo-600 hover:text-indigo-900"><EditIcon/></button>
                            </td>
                        </tr>
                    )})}
                </tbody>
              </table>
            </div>

            {editingRecord && <EditRecordModal record={editingRecord} onClose={() => setEditingRecord(null)} onSave={onRecordUpdate} />}
            {isHolidayManagerOpen && <HolidayManager holidays={holidays} onClose={() => setIsHolidayManagerOpen(false)} onSave={onHolidaysUpdate} dateRange={fullDateRange} />}
        </div>
    );
};

export default ReportView;