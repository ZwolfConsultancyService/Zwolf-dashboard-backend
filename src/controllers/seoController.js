import SEOPlan from "../models/SEOPlan.js";
import SEO from "../models/SEO.js";
import Client from "../models/Client.js";


/*
=====================================================
SEO PLANS
=====================================================
*/


export const createSEOPlan = async (req, res) => {
    try {
        const {
            name,
            durationInDays,
            price,
            description,
            keywords,
            backlinks,
            blogs,
            onPageSEO,
            technicalSEO,
            localSEO,
        } = req.body;

        if (
            !name ||
            !durationInDays ||
            price === undefined
        ) {
            return res.status(400).json({
                success: false,
                message:
                    "Name, duration and price are required",
            });
        }

        const plan = await SEOPlan.create({
            name,
            durationInDays,
            price,
            description,
            keywords,
            backlinks,
            blogs,
            onPageSEO,
            technicalSEO,
            localSEO,
            createdBy: req.user._id,
        });

        return res.status(201).json({
            success: true,
            message:
                "SEO plan created successfully",
            data: plan,
        });
    } catch (error) {
        console.error(
            "Create SEO plan error:",
            error
        );

        return res.status(500).json({
            success: false,
            message:
                "Failed to create SEO plan",
            error: error.message,
        });
    }
};


export const getSEOPlans = async (req, res) => {
    try {
        const plans = await SEOPlan.find()
            .populate(
                "createdBy",
                "name email role"
            )
            .sort({
                createdAt: -1,
            });

        return res.json({
            success: true,
            data: plans,
        });
    } catch (error) {
        return res.status(500).json({
            success: false,
            message:
                "Failed to fetch SEO plans",
            error: error.message,
        });
    }
};


export const getSEOPlanById = async (
    req,
    res
) => {
    try {
        const plan = await SEOPlan.findById(
            req.params.id
        ).populate(
            "createdBy",
            "name email role"
        );

        if (!plan) {
            return res.status(404).json({
                success: false,
                message:
                    "SEO plan not found",
            });
        }

        return res.json({
            success: true,
            data: plan,
        });
    } catch (error) {
        return res.status(500).json({
            success: false,
            message:
                "Failed to fetch SEO plan",
            error: error.message,
        });
    }
};


export const updateSEOPlan = async (
    req,
    res
) => {
    try {
        const plan =
            await SEOPlan.findByIdAndUpdate(
                req.params.id,
                req.body,
                {
                    new: true,
                    runValidators: true,
                }
            );

        if (!plan) {
            return res.status(404).json({
                success: false,
                message:
                    "SEO plan not found",
            });
        }

        return res.json({
            success: true,
            message:
                "SEO plan updated successfully",
            data: plan,
        });
    } catch (error) {
        return res.status(500).json({
            success: false,
            message:
                "Failed to update SEO plan",
            error: error.message,
        });
    }
};


export const toggleSEOPlan = async (
    req,
    res
) => {
    try {
        const plan =
            await SEOPlan.findById(
                req.params.id
            );

        if (!plan) {
            return res.status(404).json({
                success: false,
                message:
                    "SEO plan not found",
            });
        }

        plan.isActive = !plan.isActive;

        await plan.save();

        return res.json({
            success: true,
            message: `SEO plan ${plan.isActive
                    ? "activated"
                    : "deactivated"
                } successfully`,
            data: plan,
        });
    } catch (error) {
        return res.status(500).json({
            success: false,
            message:
                "Failed to update SEO plan status",
            error: error.message,
        });
    }
};


/*
=====================================================
ASSIGN SEO TO CLIENT
=====================================================
*/


export const assignSEO = async (
    req,
    res
) => {
    try {
        const {
            client,
            plan,
            startDate,
            amount,
            notes,
        } = req.body;

        if (
            !client ||
            !plan ||
            !startDate
        ) {
            return res.status(400).json({
                success: false,
                message:
                    "Client, plan and start date are required",
            });
        }

        const existingClient =
            await Client.findById(client);

        if (!existingClient) {
            return res.status(404).json({
                success: false,
                message:
                    "Client not found",
            });
        }

        const seoPlan =
            await SEOPlan.findById(plan);

        if (!seoPlan) {
            return res.status(404).json({
                success: false,
                message:
                    "SEO plan not found",
            });
        }

        if (!seoPlan.isActive) {
            return res.status(400).json({
                success: false,
                message:
                    "This SEO plan is inactive",
            });
        }

        /*
         * One client = one active SEO
         */

        const activeSEO =
            await SEO.findOne({
                client,
                status: "active",
            });

        if (activeSEO) {
            return res.status(400).json({
                success: false,
                message:
                    "Client already has an active SEO plan",
            });
        }

        const start =
            new Date(startDate);

        if (
            Number.isNaN(
                start.getTime()
            )
        ) {
            return res.status(400).json({
                success: false,
                message:
                    "Invalid start date",
            });
        }

        const end =
            new Date(start);

        end.setDate(
            end.getDate() +
            seoPlan.durationInDays
        );

        const seo =
            await SEO.create({
                client,

                plan,

                planName:
                    seoPlan.name,

                durationInDays:
                    seoPlan.durationInDays,

                amount:
                    amount !== undefined
                        ? amount
                        : seoPlan.price,

                startDate: start,

                endDate: end,

                status: "active",

                notes:
                    notes || "",

                createdBy:
                    req.user._id,

                monthlyTracking: [],
            });

        const populatedSEO =
            await SEO.findById(
                seo._id
            )
                .populate(
                    "client",
                    "clientName companyName email phone"
                )
                .populate(
                    "plan",
                    "name price durationInDays"
                )
                .populate(
                    "createdBy",
                    "name email role"
                );

        return res.status(201).json({
            success: true,
            message:
                "SEO assigned to client successfully",
            data: populatedSEO,
        });
    } catch (error) {
        console.error(
            "Assign SEO error:",
            error
        );

        return res.status(500).json({
            success: false,
            message:
                "Failed to assign SEO",
            error: error.message,
        });
    }
};


/*
=====================================================
SEO RECORDS
=====================================================
*/


export const getAllSEO = async (
    req,
    res
) => {
    try {
        const seo =
            await SEO.find()
                .populate(
                    "client",
                    "clientName companyName email phone"
                )
                .populate(
                    "plan",
                    "name price durationInDays"
                )
                .populate(
                    "createdBy",
                    "name email role"
                )
                .sort({
                    createdAt: -1,
                });

        return res.json({
            success: true,
            data: seo,
        });
    } catch (error) {
        return res.status(500).json({
            success: false,
            message:
                "Failed to fetch SEO records",
            error: error.message,
        });
    }
};


export const getSEOById = async (req, res) => {
    try {
        const seo = await SEO.findById(req.params.id)
            .populate(
                "client",
                "clientName companyName email phone"
            )
            .populate(
                "plan",
                "name price durationInDays"
            )
            .populate(
                "createdBy",
                "name email role"
            )
            .populate(
                "monthlyTracking.updatedBy",
                "name email role"
            )
            .populate(
                "dailyTracking.updatedBy",
                "name email role"
            );

        if (!seo) {
            return res.status(404).json({
                success: false,
                message: "SEO record not found",
            });
        }

        return res.json({
            success: true,
            data: seo,
        });
    } catch (error) {
        return res.status(500).json({
            success: false,
            message: "Failed to fetch SEO",
            error: error.message,
        });
    }
};


export const getClientSEO = async (
    req,
    res
) => {
    try {
        const seo =
            await SEO.find({
                client:
                    req.params.clientId,
            })
                .populate(
                    "client",
                    "clientName companyName email phone"
                )
                .populate(
                    "plan",
                    "name price durationInDays"
                )
                .sort({
                    createdAt: -1,
                });

        return res.json({
            success: true,
            data: seo,
        });
    } catch (error) {
        return res.status(500).json({
            success: false,
            message:
                "Failed to fetch client SEO",
            error: error.message,
        });
    }
};


/*
=====================================================
MONTHLY TRACKING
=====================================================
*/


export const addMonthlyTracking = async (
  req,
  res
) => {
  try {
    const { id } = req.params;

    const {
      month,
      year,
      startDate,
      endDate,
      paymentAmount,
      paidAmount,
      workStatus,
      notes,
    } = req.body;

    const seo = await SEO.findById(id);

    if (!seo) {
      return res.status(404).json({
        success: false,
        message: "SEO record not found",
      });
    }

    if (!month || !year) {
      return res.status(400).json({
        success: false,
        message:
          "Month and year are required",
      });
    }

    const alreadyExists =
      seo.monthlyTracking.some(
        (item) =>
          item.month === month &&
          Number(item.year) ===
            Number(year)
      );

    if (alreadyExists) {
      return res.status(400).json({
        success: false,
        message:
          "This month is already added",
      });
    }

    /*
     * ================================
     * PAYMENT CALCULATION
     * ================================
     */

    const totalAmount =
      Math.max(
        0,
        Number(paymentAmount || 0)
      );

    let paid =
      Math.max(
        0,
        Number(paidAmount || 0)
      );

    /*
     * Paid amount cannot be
     * greater than total amount
     */

    if (paid > totalAmount) {
      paid = totalAmount;
    }

    /*
     * Payment status is automatically
     * calculated from payment amounts
     */

    let finalPaymentStatus = "pending";

    if (
      totalAmount > 0 &&
      paid >= totalAmount
    ) {
      finalPaymentStatus = "paid";
    } else if (paid > 0) {
      finalPaymentStatus = "partial";
    }

    /*
     * ================================
     * ADD MONTHLY TRACKING
     * ================================
     */

    seo.monthlyTracking.push({
      month,
      year: Number(year),

      startDate: startDate
        ? new Date(startDate)
        : new Date(),

      endDate: endDate
        ? new Date(endDate)
        : new Date(),

      paymentAmount: totalAmount,

      paidAmount: paid,

      paymentStatus:
        finalPaymentStatus,

      workStatus:
        workStatus || "pending",

      notes: notes || "",

      updatedBy: req.user?._id,
    });

    await seo.save();

    const updatedSEO =
      await SEO.findById(id)
        .populate("client")
        .populate("plan")
        .populate(
          "monthlyTracking.updatedBy",
          "name email"
        );

    return res.status(201).json({
      success: true,
      message:
        "Monthly tracking added successfully",
      data: updatedSEO,
    });
  } catch (error) {
    console.error(
      "Add monthly tracking error:",
      error
    );

    return res.status(500).json({
      success: false,
      message:
        error.message ||
        "Failed to add monthly tracking",
    });
  }
};


export const updateMonthlyTracking = async (
  req,
  res
) => {
  try {
    const {
      id,
      trackingId,
    } = req.params;

    const seo =
      await SEO.findById(id);

    if (!seo) {
      return res.status(404).json({
        success: false,
        message: "SEO record not found",
      });
    }

    const tracking =
      seo.monthlyTracking.id(
        trackingId
      );

    if (!tracking) {
      return res.status(404).json({
        success: false,
        message:
          "Monthly tracking not found",
      });
    }

    const {
      month,
      year,
      startDate,
      endDate,
      paymentAmount,
      paidAmount,
      workStatus,
      notes,
    } = req.body;

    /*
     * ================================
     * BASIC TRACKING UPDATE
     * ================================
     */

    if (month !== undefined) {
      tracking.month = month;
    }

    if (year !== undefined) {
      tracking.year =
        Number(year);
    }

    if (startDate !== undefined) {
      tracking.startDate =
        new Date(startDate);
    }

    if (endDate !== undefined) {
      tracking.endDate =
        new Date(endDate);
    }

    /*
     * ================================
     * PAYMENT UPDATE
     * ================================
     */

    if (paymentAmount !== undefined) {
      tracking.paymentAmount =
        Math.max(
          0,
          Number(paymentAmount)
        );
    }

    if (paidAmount !== undefined) {
      tracking.paidAmount =
        Math.max(
          0,
          Number(paidAmount)
        );
    }

    /*
     * ================================
     * OTHER FIELDS
     * ================================
     */

    if (workStatus !== undefined) {
      tracking.workStatus =
        workStatus;
    }

    if (notes !== undefined) {
      tracking.notes =
        notes;
    }

    /*
     * ================================
     * AUTOMATIC PAYMENT CALCULATION
     * ================================
     */

    const totalAmount =
      Math.max(
        0,
        Number(
          tracking.paymentAmount || 0
        )
      );

    let paidAmountValue =
      Math.max(
        0,
        Number(
          tracking.paidAmount || 0
        )
      );

    /*
     * Paid amount cannot be greater
     * than total amount
     */

    if (
      paidAmountValue >
      totalAmount
    ) {
      paidAmountValue =
        totalAmount;
    }

    tracking.paidAmount =
      paidAmountValue;

    /*
     * Payment status automatically
     * calculated by backend
     */

    if (
      totalAmount > 0 &&
      paidAmountValue >= totalAmount
    ) {
      tracking.paymentStatus =
        "paid";
    } else if (
      paidAmountValue > 0
    ) {
      tracking.paymentStatus =
        "partial";
    } else {
      tracking.paymentStatus =
        "pending";
    }

    /*
     * ================================
     * UPDATED BY
     * ================================
     */

    tracking.updatedBy =
      req.user?._id;

    await seo.save();

    const updatedSEO =
      await SEO.findById(id)
        .populate("client")
        .populate("plan")
        .populate(
          "monthlyTracking.updatedBy",
          "name email"
        );

    return res.json({
      success: true,
      message:
        "Monthly tracking updated successfully",
      data: updatedSEO,
    });
  } catch (error) {
    console.error(
      "Update monthly tracking error:",
      error
    );

    return res.status(500).json({
      success: false,
      message:
        error.message ||
        "Failed to update monthly tracking",
    });
  }
};


export const deleteMonthlyTracking =
    async (req, res) => {
        try {
            const seo =
                await SEO.findById(
                    req.params.id
                );

            if (!seo) {
                return res.status(404).json({
                    success: false,
                    message:
                        "SEO record not found",
                });
            }

            const tracking =
                seo.monthlyTracking.id(
                    req.params.trackingId
                );

            if (!tracking) {
                return res.status(404).json({
                    success: false,
                    message:
                        "Monthly tracking not found",
                });
            }

            tracking.deleteOne();

            await seo.save();

            return res.json({
                success: true,
                message:
                    "Monthly tracking deleted successfully",
                data: seo,
            });
        } catch (error) {
            return res.status(500).json({
                success: false,
                message:
                    "Failed to delete monthly tracking",
                error: error.message,
            });
        }
    };


/*
=====================================================
SEO STATUS
=====================================================
*/


export const updateSEOStatus =
    async (req, res) => {
        try {
            const {
                status,
            } = req.body;

            if (
                ![
                    "active",
                    "expired",
                    "cancelled",
                ].includes(status)
            ) {
                return res.status(400).json({
                    success: false,
                    message:
                        "Invalid SEO status",
                });
            }

            const seo =
                await SEO.findByIdAndUpdate(
                    req.params.id,
                    { status },
                    {
                        new: true,
                        runValidators: true,
                    }
                );

            if (!seo) {
                return res.status(404).json({
                    success: false,
                    message:
                        "SEO record not found",
                });
            }

            return res.json({
                success: true,
                message:
                    "SEO status updated successfully",
                data: seo,
            });
        } catch (error) {
            return res.status(500).json({
                success: false,
                message:
                    "Failed to update SEO status",
                error: error.message,
            });
        }
    };

/*
=====================================================
DAILY TRACKING
=====================================================
*/


export const addDailyTracking =
    async (req, res) => {
        try {
            const seo =
                await SEO.findById(
                    req.params.id
                );

            if (!seo) {
                return res.status(404).json({
                    success: false,
                    message:
                        "SEO record not found",
                });
            }

            const {
                date,
                keywordsCompleted,
                backlinksCompleted,
                blogsCompleted,
                onPageCompleted,
                technicalCompleted,
                workStatus,
                notes,
            } = req.body;

            if (!date) {
                return res.status(400).json({
                    success: false,
                    message:
                        "Date is required",
                });
            }

            const trackingDate =
                new Date(date);

            if (
                Number.isNaN(
                    trackingDate.getTime()
                )
            ) {
                return res.status(400).json({
                    success: false,
                    message:
                        "Invalid tracking date",
                });
            }

            /*
             * Prevent duplicate daily entry
             */

            const duplicate =
                seo.dailyTracking.some(
                    (item) => {
                        const existingDate =
                            new Date(item.date);

                        return (
                            existingDate
                                .toISOString()
                                .split("T")[0] ===
                            trackingDate
                                .toISOString()
                                .split("T")[0]
                        );
                    }
                );

            if (duplicate) {
                return res.status(400).json({
                    success: false,
                    message:
                        "Daily tracking for this date already exists",
                });
            }

            /*
             * Make sure daily date
             * belongs to SEO duration
             */

            const startDate =
                new Date(seo.startDate);

            const endDate =
                new Date(seo.endDate);

            startDate.setHours(
                0,
                0,
                0,
                0
            );

            endDate.setHours(
                23,
                59,
                59,
                999
            );

            if (
                trackingDate < startDate ||
                trackingDate > endDate
            ) {
                return res.status(400).json({
                    success: false,
                    message:
                        "Tracking date must be within the SEO plan duration",
                });
            }

            seo.dailyTracking.push({
                date: trackingDate,

                keywordsCompleted:
                    keywordsCompleted || 0,

                backlinksCompleted:
                    backlinksCompleted || 0,

                blogsCompleted:
                    blogsCompleted || 0,

                onPageCompleted:
                    onPageCompleted || 0,

                technicalCompleted:
                    technicalCompleted || 0,

                workStatus:
                    workStatus ||
                    "pending",

                notes:
                    notes || "",

                updatedBy:
                    req.user._id,
            });

            await seo.save();

            return res.status(201).json({
                success: true,
                message:
                    "Daily SEO tracking added successfully",
                data: seo,
            });
        } catch (error) {
            console.error(
                "Add daily tracking error:",
                error
            );

            return res.status(500).json({
                success: false,
                message:
                    "Failed to add daily tracking",
                error: error.message,
            });
        }
    };


export const getDailyTracking =
    async (req, res) => {
        try {
            const seo =
                await SEO.findById(
                    req.params.id
                )
                    .populate(
                        "dailyTracking.updatedBy",
                        "name email role"
                    );

            if (!seo) {
                return res.status(404).json({
                    success: false,
                    message:
                        "SEO record not found",
                });
            }

            const tracking =
                [...seo.dailyTracking].sort(
                    (a, b) =>
                        new Date(b.date) -
                        new Date(a.date)
                );

            return res.json({
                success: true,
                data: tracking,
            });
        } catch (error) {
            console.error(
                "Get daily tracking error:",
                error
            );

            return res.status(500).json({
                success: false,
                message:
                    "Failed to fetch daily tracking",
                error: error.message,
            });
        }
    };


export const updateDailyTracking =
    async (req, res) => {
        try {
            const seo =
                await SEO.findById(
                    req.params.id
                );

            if (!seo) {
                return res.status(404).json({
                    success: false,
                    message:
                        "SEO record not found",
                });
            }

            const tracking =
                seo.dailyTracking.id(
                    req.params.trackingId
                );

            if (!tracking) {
                return res.status(404).json({
                    success: false,
                    message:
                        "Daily tracking not found",
                });
            }

            /*
             * If date is being changed,
             * validate it.
             */

            if (req.body.date) {
                const newDate =
                    new Date(req.body.date);

                if (
                    Number.isNaN(
                        newDate.getTime()
                    )
                ) {
                    return res.status(400).json({
                        success: false,
                        message:
                            "Invalid tracking date",
                    });
                }

                const startDate =
                    new Date(seo.startDate);

                const endDate =
                    new Date(seo.endDate);

                startDate.setHours(
                    0,
                    0,
                    0,
                    0
                );

                endDate.setHours(
                    23,
                    59,
                    59,
                    999
                );

                if (
                    newDate < startDate ||
                    newDate > endDate
                ) {
                    return res.status(400).json({
                        success: false,
                        message:
                            "Tracking date must be within the SEO plan duration",
                    });
                }
            }

            Object.assign(
                tracking,
                req.body
            );

            tracking.updatedBy =
                req.user._id;

            await seo.save();

            return res.json({
                success: true,
                message:
                    "Daily SEO tracking updated successfully",
                data: seo,
            });
        } catch (error) {
            console.error(
                "Update daily tracking error:",
                error
            );

            return res.status(500).json({
                success: false,
                message:
                    "Failed to update daily tracking",
                error: error.message,
            });
        }
    };


export const deleteDailyTracking =
    async (req, res) => {
        try {
            const seo =
                await SEO.findById(
                    req.params.id
                );

            if (!seo) {
                return res.status(404).json({
                    success: false,
                    message:
                        "SEO record not found",
                });
            }

            const tracking =
                seo.dailyTracking.id(
                    req.params.trackingId
                );

            if (!tracking) {
                return res.status(404).json({
                    success: false,
                    message:
                        "Daily tracking not found",
                });
            }

            tracking.deleteOne();

            await seo.save();

            return res.json({
                success: true,
                message:
                    "Daily tracking deleted successfully",
                data: seo,
            });
        } catch (error) {
            console.error(
                "Delete daily tracking error:",
                error
            );

            return res.status(500).json({
                success: false,
                message:
                    "Failed to delete daily tracking",
                error: error.message,
            });
        }
    };

    /*
=====================================================
DELETE SEO RECORD
=====================================================
*/

export const deleteSEO = async (req, res) => {
    try {
        const { id } = req.params;

        const seo = await SEO.findById(id);

        if (!seo) {
            return res.status(404).json({
                success: false,
                message: "SEO record not found",
            });
        }

        await SEO.findByIdAndDelete(id);

        return res.json({
            success: true,
            message: "SEO record deleted successfully",
        });
    } catch (error) {
        console.error(
            "Delete SEO error:",
            error
        );

        return res.status(500).json({
            success: false,
            message: "Failed to delete SEO record",
            error: error.message,
        });
    }
};