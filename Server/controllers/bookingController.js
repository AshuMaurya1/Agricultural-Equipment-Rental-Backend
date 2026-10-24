import Booking from '../models/Booking.js';
import Tractor from '../models/tractor.js';

const defaultImplements = [
    { name: "Rotavator (42-blades)", pricePerDay: 500, pricePerHour: 150, pricePerAcre: 300 },
    { name: "Cultivator / Harrow (9-tyne)", pricePerDay: 300, pricePerHour: 100, pricePerAcre: 200 },
    { name: "MB Reversible Plough", pricePerDay: 400, pricePerHour: 120, pricePerAcre: 250 },
    { name: "Heavy Duty Tipping Trolley", pricePerDay: 600, pricePerHour: 180, pricePerAcre: 350 }
];

// Helper to check single tractor availability
const checkAvailability = async (tractorId, startDate, endDate) => {
    const start = new Date(startDate);
    const end = new Date(endDate);

    const conflictingBooking = await Booking.findOne({
        tractor: tractorId,
        status: { $ne: 'cancelled' },
        startDate: { $lt: end },
        endDate: { $gt: start }
    });
    if (conflictingBooking) return false;

    // Check if any date in the range matches an owner-blocked date
    const tractor = await Tractor.findById(tractorId).select('blockedDates');
    if (tractor && tractor.blockedDates && tractor.blockedDates.length > 0) {
        for (const blocked of tractor.blockedDates) {
            const bDate = new Date(blocked);
            if (bDate >= start && bDate <= end) {
                return false;
            }
        }
    }

    return true;
};

// API to check Availability of Tractor for the given dates and Location (Optimized: single batch query)
export const checkTractorAvailability = async (req, res) => {
    try {
        const { location, startDate, endDate } = req.body;

        if (!startDate || !endDate) {
            return res.status(400).json({ success: false, message: 'startDate and endDate are required' });
        }

        const start = new Date(startDate);
        const end = new Date(endDate);
        if (isNaN(start.getTime()) || isNaN(end.getTime()) || start >= end) {
            return res.status(400).json({ success: false, message: 'Invalid date range. Start date must be before end date.' });
        }

        // Batch query: Find all tractors that already have overlapping active bookings
        const bookedTractorIds = await Booking.distinct('tractor', {
            status: { $ne: 'cancelled' },
            startDate: { $lt: end },
            endDate: { $gt: start }
        });

        const query = {
            isAvailable: true,
            _id: { $nin: bookedTractorIds }
        };

        if (location && location.trim() !== '') {
            query.location = { $regex: new RegExp(location.trim(), 'i') };
        }

        const candidateTractors = await Tractor.find(query);

        // Filter out tractors blocked by owner maintenance dates directly in memory
        const availableTractors = candidateTractors.filter((tractor) => {
            if (tractor.blockedDates && tractor.blockedDates.length > 0) {
                for (const blocked of tractor.blockedDates) {
                    const bDate = new Date(blocked);
                    if (bDate >= start && bDate <= end) {
                        return false;
                    }
                }
            }
            return true;
        }).map((tractor) => {
            const doc = tractor._doc || tractor;
            return {
                ...doc,
                implementsAvailable: (doc.implementsAvailable && doc.implementsAvailable.length > 0)
                    ? doc.implementsAvailable
                    : defaultImplements,
                driverAvailable: doc.driverAvailable ?? true,
                driverDailyRate: doc.driverDailyRate ?? 500,
                driverHourlyRate: doc.driverHourlyRate ?? 100,
                horsePower: doc.horsePower ?? 50,
                pricePerHour: doc.pricePerHour ?? 600,
                pricePerAcre: doc.pricePerAcre ?? 1200,
                transportRatePerKm: doc.transportRatePerKm ?? 40,
                blockedDates: doc.blockedDates || [],
                rating: doc.rating ?? 4.8,
                ratingCount: doc.ratingCount ?? 1
            };
        });

        res.json({ success: true, availableTractors });
    } catch (error) {
        console.error('checkTractorAvailability error:', error.message);
        return res.status(500).json({ success: false, message: error.message });
    }
};

// API to Create Booking with Implements, Driver, Unit Selection, Transport & Online Advance
export const createBooking = async (req, res) => {
    try {
        const { _id } = req.user;
        const {
            tractorId,
            startDate,
            endDate,
            rentalUnit = 'day', // 'day' | 'hour' | 'acre'
            unitsBooked = 1,
            selectedImplements = [],
            withDriver = false,
            transportDistanceKm = 0,
            paymentMethod = 'pay_on_delivery',
            customerNotes = '',
            transactionId = ''
        } = req.body;

        if (!tractorId || !startDate || !endDate) {
            return res.status(400).json({ success: false, message: 'tractorId, startDate, and endDate are required' });
        }

        const start = new Date(startDate);
        const end = new Date(endDate);
        if (isNaN(start.getTime()) || isNaN(end.getTime()) || start >= end) {
            return res.status(400).json({ success: false, message: 'Invalid booking date range' });
        }

        const TractorData = await Tractor.findById(tractorId);
        if (!TractorData) {
            return res.status(404).json({ success: false, message: 'Tractor not found' });
        }

        if (!TractorData.isAvailable) {
            return res.status(400).json({ success: false, message: 'This tractor is currently marked as unavailable for booking' });
        }

        // Prevent owners from booking their own equipment
        if (TractorData.owner.toString() === _id.toString()) {
            return res.status(400).json({ success: false, message: 'Owners cannot book their own tractor' });
        }

        // Atomic check to prevent double bookings
        const conflictingBooking = await Booking.findOne({
            tractor: tractorId,
            status: { $ne: 'cancelled' },
            startDate: { $lt: end },
            endDate: { $gt: start }
        });

        if (conflictingBooking) {
            return res.status(409).json({ success: false, message: 'Tractor is no longer available for the selected dates' });
        }

        // Check maintenance blocked dates
        if (TractorData.blockedDates && TractorData.blockedDates.length > 0) {
            for (const blocked of TractorData.blockedDates) {
                const bDate = new Date(blocked);
                if (bDate >= start && bDate <= end) {
                    return res.status(409).json({ success: false, message: `Tractor is scheduled for maintenance on ${blocked}` });
                }
            }
        }

        const count = Math.max(1, Number(unitsBooked || 1));
        let baseTractorPrice = 0;
        let implementsPrice = 0;
        let driverPrice = 0;

        if (rentalUnit === 'hour') {
            const hourlyRate = Number(TractorData.pricePerHour || 600);
            baseTractorPrice = count * hourlyRate;
            implementsPrice = (selectedImplements || []).reduce(
                (sum, item) => sum + Number(item.pricePerHour || 150),
                0
            ) * count;
            driverPrice = withDriver ? count * Number(TractorData.driverHourlyRate || 100) : 0;
        } else if (rentalUnit === 'acre') {
            const acreRate = Number(TractorData.pricePerAcre || 1200);
            baseTractorPrice = count * acreRate;
            implementsPrice = (selectedImplements || []).reduce(
                (sum, item) => sum + Number(item.pricePerAcre || 300),
                0
            ) * count;
            driverPrice = withDriver ? count * 250 : 0;
        } else {
            // Default: 'day'
            const diffDays = Math.max(1, Math.ceil(Math.abs(end - start) / (1000 * 60 * 60 * 24)));
            const days = Math.max(diffDays, count);

            baseTractorPrice = days * Number(TractorData.pricePerDay || 0);
            const implementsDailySum = (selectedImplements || []).reduce(
                (sum, item) => sum + Number(item.pricePerDay || 0),
                0
            );
            implementsPrice = days * implementsDailySum;
            const driverDailyRate = Number(TractorData.driverDailyRate || 500);
            driverPrice = withDriver ? days * driverDailyRate : 0;
        }

        const transportRate = Number(TractorData.transportRatePerKm || 40);
        const transportPrice = Math.max(0, Number(transportDistanceKm || 0)) * transportRate;
        const totalPrice = baseTractorPrice + implementsPrice + driverPrice + transportPrice;

        let advanceAmount = 0;
        let paymentStatus = 'pending';

        if (paymentMethod === 'online_advance') {
            advanceAmount = Math.round(totalPrice * 0.2); // 20% advance token
            // In production, this should be confirmed via payment webhook
            paymentStatus = transactionId ? 'advance_paid' : 'pending';
        } else if (paymentMethod === 'full_online') {
            advanceAmount = totalPrice;
            paymentStatus = transactionId ? 'fully_paid' : 'pending';
        }

        const newBooking = await Booking.create({
            tractor: TractorData._id,
            owner: TractorData.owner,
            user: _id,
            startDate: start,
            endDate: end,
            rentalUnit,
            unitsBooked: count,
            price: totalPrice,
            selectedImplements,
            withDriver: Boolean(withDriver),
            driverPrice,
            implementsPrice,
            transportDistanceKm: Number(transportDistanceKm || 0),
            transportPrice,
            paymentMethod,
            paymentStatus,
            advanceAmount,
            transactionId: transactionId || (paymentMethod !== 'pay_on_delivery' ? `TXN${Date.now()}` : ''),
            customerNotes
        });

        res.status(201).json({ success: true, message: 'Booking created successfully', booking: newBooking });
    } catch (error) {
        console.error('createBooking error:', error.message);
        return res.status(500).json({ success: false, message: error.message });
    }
};

// API to List User Bookings
export const getUserBookings = async (req, res) => {
    try {
        const { _id } = req.user;
        const bookings = await Booking.find({ user: _id })
            .populate('tractor')
            .populate({ path: 'owner', select: 'name email phone' })
            .sort({ createdAt: -1 });
        res.json({ success: true, bookings });
    } catch (error) {
        console.error('getUserBookings error:', error.message);
        return res.status(500).json({ success: false, message: error.message });
    }
};

// API To Get Owner Bookings
export const getOwnerBookings = async (req, res) => {
    try {
        const bookings = await Booking.find({ owner: req.user._id })
            .populate('tractor')
            .populate({ path: 'user', select: '-password' })
            .sort({ createdAt: -1 });
        res.json({ success: true, bookings });
    } catch (error) {
        console.error('getOwnerBookings error:', error.message);
        return res.status(500).json({ success: false, message: error.message });
    }
};

// User or Owner can Update Booking Status
export const updateBookingStatus = async (req, res) => {
    try {
        const { _id } = req.user;
        const { bookingId, status } = req.body;
        
        const validStatuses = ['pending', 'confirmed', 'cancelled'];
        if (!validStatuses.includes(status)) {
            return res.status(400).json({ success: false, message: `Invalid status. Must be one of: ${validStatuses.join(', ')}` });
        }

        const booking = await Booking.findById(bookingId);
        if (!booking) {
            return res.status(404).json({ success: false, message: 'Booking not found' });
        }

        const isOwner = booking.owner.toString() === _id.toString();
        const isUser = booking.user.toString() === _id.toString();

        if (!isOwner && !isUser) {
            return res.status(403).json({ success: false, message: 'Unauthorized' });
        }

        // If regular user, they can only cancel their own pending booking
        if (isUser && !isOwner) {
            if (status !== 'cancelled') {
                return res.status(400).json({ success: false, message: 'Users can only cancel their bookings' });
            }
            if (booking.status !== 'pending') {
                return res.status(400).json({ success: false, message: 'Only pending bookings can be cancelled by user' });
            }
        }

        booking.status = status;
        await booking.save();
        res.json({ success: true, message: `Booking status updated to ${status}` });
    } catch (error) {
        console.error('updateBookingStatus error:', error.message);
        return res.status(500).json({ success: false, message: error.message });
    }
};